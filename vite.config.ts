// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Build-time env lookup, tolerant of the strict index-signature rules in tsconfig. */
const env = (key: string): string => process.env[key] ?? "";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    preset: "cloudflare-module",
    // `wrangler` is passed through to the generated wrangler.json but isn't in
    // nitro's published cloudflare option type, hence the cast. Verified working:
    // the deploy log lists each value under "Your Worker has access to...".
    cloudflare: {
      nodeCompat: true,
      deployConfig: true,
      // The deployed Worker's dashboard "Variables and Secrets" don't reach the
      // running Worker through this project's CI deploy command, so bake the
      // server-only values straight into the generated wrangler config instead
      // (sourced from the CI's *build*-time env, which is confirmed reliable).
      wrangler: {
        vars: {
          SUPABASE_URL: env("SUPABASE_URL") || env("VITE_SUPABASE_URL"),
          SUPABASE_PUBLISHABLE_KEY: env("SUPABASE_PUBLISHABLE_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY"),
          SUPABASE_PROJECT_ID: env("SUPABASE_PROJECT_ID") || env("VITE_SUPABASE_PROJECT_ID"),
          SUPABASE_SERVICE_ROLE_KEY: env("SUPABASE_SERVICE_ROLE_KEY"),
        },
      },
    } as { nodeCompat: boolean; deployConfig: boolean },
  },
});
