import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      name: "matrix-crdt",
      entry: resolve(__dirname, "src/index.ts"),
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [
        "yjs",
        "vscode-lib",
        "lib0",
        "matrix-js-sdk",
        "y-protocols",
        "lodash",
        "simple-peer",
        "another-json",
      ],
    },
  },
  test: {
    setupFiles: "src/setupTests.ts",
    coverage: {
      reporter: ["text", "json", "html", "lcov"],
    },
  },
});
