import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// The backend stays behind the `/api` proxy rather than a separate origin, so
// the browser only ever sees the Vite origin (no CORS/cookie split). The
// Portless dev wrapper allocates the backend a per-worktree port and passes it
// via SERVER_URL; falls back to the fixed port for a bare `vite`/`react-router
// dev` run.
const serverUrl = process.env.SERVER_URL ?? "http://localhost:3000/";

// Portless assigns this dev server a port via the PORT env var and proxies the
// stable URL to it, but React Router / Vite ignore PORT — so apply it here.
// strictPort makes a clash fail loudly instead of silently drifting to another
// port that Portless isn't routing to (which surfaces as a 502).
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    ...(port ? { port, strictPort: true } : {}),
    host: process.env.HOST || undefined,
    proxy: {
      // OAuth AS metadata (RFC 8414) lives outside `/api/*`; forward to the
      // server so `APP_BASE_URL` can stay on the Vite origin in dev.
      "/.well-known": {
        target: serverUrl,
        changeOrigin: true,
      },
      "/api": {
        target: serverUrl,
        changeOrigin: true,
      },
    },
  },
});
