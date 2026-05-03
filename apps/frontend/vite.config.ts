import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    proxy: {
      // OAuth AS metadata (RFC 8414) lives outside `/api/*`; forward to the
      // server so `APP_BASE_URL` can stay on the Vite origin in dev.
      "/.well-known": {
        target: "http://localhost:3000/",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3000/",
        changeOrigin: true,
      },
    },
  },
});
