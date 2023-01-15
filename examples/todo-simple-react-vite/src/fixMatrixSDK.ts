import { Buffer } from "buffer";
import * as process from "process";

/**
 * Matrix-js-sdk doesn't work nicely without these globals
 *
 * Also needs global = window, set in vite.config.ts
 */
export function applyMatrixSDKPolyfills() {
  (window as any).Buffer = Buffer;
  (window as any).process = process;
}
