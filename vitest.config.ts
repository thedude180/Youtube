import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: [
      "server/**/*.test.ts",
      "client/src/lib/**/*.test.ts",
      "client/src/components/**/*.test.tsx",
    ],
    environmentMatchGlobs: [
      ["client/src/components/**/*.test.tsx", "happy-dom"],
    ],
    setupFiles: ["./client/src/test-setup.ts"],
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});
