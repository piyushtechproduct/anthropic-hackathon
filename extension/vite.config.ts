import { defineConfig } from "vite";

// Vitest config only — build uses esbuild directly (see package.json)
export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
