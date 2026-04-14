import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// ESM has no `__dirname`; this must resolve to `client/` so `..` is the monorepo root.
const clientDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(clientDir, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const apiPort = env.PORT || "8000";

  return {
    envDir: repoRoot,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(clientDir, "src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
