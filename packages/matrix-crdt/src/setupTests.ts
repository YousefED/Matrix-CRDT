const { randomFillSync } = require("crypto");
(globalThis as any).Olm = require("@matrix-org/olm");

// const { Crypto } = require("@peculiar/webcrypto");
// const crypto = new Crypto();

Object.defineProperty(globalThis, "crypto", {
  value: {
    getRandomValues: randomFillSync,
    // , subtle: crypto.subtle
  },
});

export {};
