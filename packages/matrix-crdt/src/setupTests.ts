// https://github.com/developit/microbundle/issues/708, otherwise vscode-lib fails
import "regenerator-runtime/runtime.js";

const { randomFillSync } = require("crypto");
(global as any).Olm = require("@matrix-org/olm");
// const { Crypto } = require("@peculiar/webcrypto");
// const crypto = new Crypto();

Object.defineProperty(globalThis, "crypto", {
  value: {
    getRandomValues: randomFillSync,
    // , subtle: crypto.subtle
  },
});
