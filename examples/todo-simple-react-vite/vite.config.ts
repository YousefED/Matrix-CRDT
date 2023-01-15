import react from "@vitejs/plugin-react";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // required for @primer/react
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    minify: false,
    // needed for matrix-js-sdk:
    rollupOptions: {
      // Enable rollup polyfills plugin
      // used during production bundling
      plugins: [nodePolyfills()],
    },
  },
  // needed for matrix-js-sdk:
  define: { global: "window" },
});
