import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthError, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.js";

type Role = "admin" | "customer" | "driver" | "super_admin";

const VALID_ROLES: Role[] = ["admin", "customer", "driver", "super_admin"];

/** Dashboard path for each known role (used for redirects). */
export const ROLE_DASHBOARD_PATHS: Record<Role, string> = {
  admin:       "/admin/dashboard",
  customer:    "/customer/home",
  driver:      "/driver/dashboard",
  super_admin: "/dev/dashboard",
};

function normalizeRole(role: unknown): Role | null {
  if (typeof role !== "string") return null;
  const r = role.toLowerCase();
  return VALID_ROLES.includes(r as Role) ? (r as Role) : null;
}

async function fetchProfileRole(userId: string): Promise<Role | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return normalizeRole(data?.role);
}

/** Business shape from business_profile table */
export type BusinessProfile = {
  id: string;
  admin_id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email?: string;
  address?: string;
  logo_url?: string;
  business_type?: string;
  gst_number?: string;
  updates_phone: string;
};

/**
 * Fetch the business profile for an admin user.
 * Returns null if no business has been set up yet.
 */
async function fetchAdminBusiness(userId: string): Promise<BusinessProfile | null> {
  const { data, error } = await supabase
    .from("business_profile")
    .select("*")
    .eq("admin_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[AuthContext] business_profile fetch:", error.message);
    return null;
  }
  return data ?? null;
}

type AuthContextValue = {
  user: User | null;
  role: Role | null;
  loading: boolean;
  /** Admin's business profile — null if not set up yet */
  businessProfile: BusinessProfile | null;
  /** Selected business ID (persisted to localStorage) */
  selectedBusinessId: string | null;
  setSelectedBusinessId: (id: string | null) => void;
  signIn: (args: {
    phone: string;
    password: string;
  }) => Promise<{ error: AuthError | null }>;
  signUp: (args: {
    email: string;
    password: string;
  }) => ReturnType<typeof supabase.auth.signUp>;
  signOut: () => ReturnType<typeof supabase.auth.signOut>;
  /** Initiates Google OAuth — stores pendingRole in localStorage before redirect */
  signInWithGoogle: (pendingRole: Role) => Promise<void>;
  /** Reload the business profile from DB */
  refreshBusiness: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const LS_BUSINESS_KEY = "selectedBusinessId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,            setUser]            = useState<User | null>(null);
  const [role,            setRole]            = useState<Role | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [selectedBusinessId, setSelectedBusinessIdState] = useState<string | null>(
    () => localStorage.getItem(LS_BUSINESS_KEY) ?? null,
  );

  const setSelectedBusinessId = useCallback((id: string | null) => {
    setSelectedBusinessIdState(id);
    if (id) {
      localStorage.setItem(LS_BUSINESS_KEY, id);
    } else {
      localStorage.removeItem(LS_BUSINESS_KEY);
    }
  }, []);

  /** Fetch and cache admin's business profile */
  const refreshBusiness = useCallback(async (userId?: string) => {
    const uid = userId ?? user?.id;
    if (!uid) return;
    const bp = await fetchAdminBusiness(uid);
    setBusinessProfile(bp);
    if (bp?.id) {
      setSelectedBusinessId(bp.id);
    }
  }, [user?.id, setSelectedBusinessId]);

  useEffect(() => {
    let cancelled = false;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        const nextUser = session?.user ?? null;

        setUser(nextUser);
        setRole(null);
        setLoading(true);

        // Clear business profile on sign-out
        if (!nextUser) {
          setBusinessProfile(null);
        }

        queueMicrotask(() => {
          void (async () => {
            try {
              if (nextUser) {
                const r = await fetchProfileRole(nextUser.id);
                if (!cancelled) {
                  setRole(r);
                  // Auto-load business profile for admins
                  if (r === "admin") {
                    const bp = await fetchAdminBusiness(nextUser.id);
                    if (!cancelled) {
                      setBusinessProfile(bp);
                      if (bp?.id) setSelectedBusinessId(bp.id);
                    }
                  }
                }
              } else {
                if (!cancelled) setRole(null);
              }
            } catch (e) {
              console.error("[AuthContext] profile/business fetch failed", e);
              if (!cancelled) setRole(null);
            } finally {
              if (!cancelled) setLoading(false);
            }
          })();
        });
      },
    );

    const subscription = listener?.subscription;
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [setSelectedBusinessId]);

  const signIn = useCallback(async ({ phone, password }: { phone: string; password: string }) => {
    const { error } = await supabase.auth.signInWithPassword({ phone, password });
    return { error };
  }, []);

  const signUp = useCallback(async ({ email, password }: { email: string; password: string }) => {
    return supabase.auth.signUp({ email, password });
  }, []);

  const signOut = useCallback(async () => {
    setSelectedBusinessId(null);
    setBusinessProfile(null);
    const { error } = await supabase.auth.signOut();
    return { error };
  }, [setSelectedBusinessId]);

  const signInWithGoogle = useCallback(async (pendingRole: Role) => {
    localStorage.setItem("pendingRole", pendingRole);
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      businessProfile,
      selectedBusinessId,
      setSelectedBusinessId,
      signIn,
      signUp,
      signOut,
      signInWithGoogle,
      refreshBusiness,
    }),
    [user, role, loading, businessProfile, selectedBusinessId,
     setSelectedBusinessId, signIn, signUp, signOut, signInWithGoogle, refreshBusiness],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
