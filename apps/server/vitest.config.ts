import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**"],
  },
});
