import { createClient, MemoryStore } from "matrix-js-sdk";

export async function createMatrixGuestClient(config: { baseUrl: string }) {
  const tmpClient = await createClient(config);
  const { user_id, device_id, access_token } = await tmpClient.registerGuest(
    {}
  );
  let matrixClient = createClient({
    baseUrl: config.baseUrl,
    accessToken: access_token,
    userId: user_id,
    deviceId: device_id,
    store: new MemoryStore() as any,
  });

  // hardcoded overwrites
  (matrixClient as any).canSupportVoip = false;

  matrixClient.setGuest(true);
  await matrixClient.initCrypto();
  matrixClient.setCryptoTrustCrossSignedDevices(true);
  matrixClient.setGlobalErrorOnUnknownDevices(false);

  await matrixClient.startClient({
    lazyLoadMembers: true,
    initialSyncLimit: 0,
  });

  return matrixClient;
}
