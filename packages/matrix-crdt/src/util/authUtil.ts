import { MatrixClient } from "matrix-js-sdk";
import { MatrixMemberReader } from "../memberReader/MatrixMemberReader";
import { verifySignature } from "./olmlib";

/**
 * Sign an object (obj) with the users ed25519 key
 */
export async function signObject(client: MatrixClient, obj: any) {
  await client.crypto.signObject(obj);
}

/**
 * Verifies whether the signature on obj (obj.signature) is valid.
 * This validates:
 * - Whether the object has been created by the Matrix user
 *    (by checking the signature with that user's public key)
 * - Whether that user has access to the room (this is delegated to matrixMemberReader)
 *
 * Throws an error if invalid
 */
export async function verifyObject(
  client: MatrixClient,
  memberReader: MatrixMemberReader,
  obj: any,
  eventTypeAccessRequired: string
) {
  if (!obj.signatures || Object.keys(obj.signatures).length !== 1) {
    throw new Error("invalid signature");
  }
  const userId = Object.keys(obj.signatures)[0];
  if (!memberReader.hasWriteAccess(userId, eventTypeAccessRequired)) {
    throw new Error("user doesn't have write access");
  }

  const keyToGet = Object.keys(obj.signatures[userId])[0];
  if (!keyToGet.startsWith("ed25519:")) {
    throw new Error("unexpected key");
  }
  const deviceToGet = keyToGet.substr("ed25519:".length);

  client.crypto.deviceList.startTrackingDeviceList(userId);
  const keys = await client.crypto.deviceList.downloadKeys([userId]);
  const deviceKey = keys[userId][deviceToGet].keys[keyToGet];
  if (!deviceKey) {
    throw new Error("key not found");
  }
  // This throws an error if it's invalid
  await verifySignature(
    client.crypto.olmDevice,
    obj,
    userId,
    deviceToGet,
    deviceKey
  );
}
