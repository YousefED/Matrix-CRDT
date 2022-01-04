// https://stackoverflow.com/questions/21553528/how-to-test-for-equality-in-arraybuffer-dataview-and-typedarray

// compare ArrayBuffers
export function arrayBuffersAreEqual(a: ArrayBuffer, b: ArrayBuffer) {
  return dataViewsAreEqual(new DataView(a), new DataView(b));
}

// compare DataViews
export function dataViewsAreEqual(a: DataView, b: DataView) {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a.getUint8(i) !== b.getUint8(i)) return false;
  }
  return true;
}

// compare TypedArrays
export function typedArraysAreEqual(a: Uint8Array, b: Uint8Array) {
  if (a.byteLength !== b.byteLength) return false;
  return a.every((val, i) => val === b[i]);
}
