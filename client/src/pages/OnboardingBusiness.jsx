import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * OnboardingBusiness — shown to new admins who have no business profile yet.
 *
 * Checks on mount whether a business now exists (in case user navigated here
 * manually but already has one). If yes → redirect to dashboard.
 * If no → redirect to /admin/setup (existing BusinessSetup page).
 *
 * This keeps business setup logic in one place (BusinessSetup.jsx)
 * while giving the onboarding route a clean landing experience.
 */
export default function OnboardingBusiness() {
  const navigate   = useNavigate();
  const { user }   = useAuth();

  useEffect(() => {
    // Small delay so AuthContext has resolved user before we act
    const t = setTimeout(() => {
      // Redirect to the existing business setup page
      navigate("/admin/setup", { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [navigate, user]);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-5 p-6">
      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-6 text-center max-w-sm">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-indigo-500/30">
          🏢
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-zinc-100">Welcome to FlowStock!</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Let's set up your business profile so your customers can start placing orders.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
