import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Deliberately standalone rather than reusing vite.config.ts: the app's Vite
// config pulls in the whole Lovable plugin set (TanStack Start, nitro, Tailwind),
// none of which the pure-logic tests need.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
