import { createClient, MemoryStore } from "matrix-js-sdk";

export async function createMatrixGuestClient(config: { baseUrl: string }) {
  const tmpClient = await createClient(config);
  const { user_id, device_id, access_token } = await tmpClient.registerGuest();
  let matrixClient = createClient({
    baseUrl: config.baseUrl,
    accessToken: access_token,
    userId: user_id,
    deviceId: device_id,
    sessionStore: new MemoryStore(),
  });

  // hardcoded overwrites
  matrixClient.canSupportVoip = false;
  matrixClient.clientOpts = {
    lazyLoadMembers: true,
  };

  matrixClient.setGuest(true);
  await matrixClient.initCrypto();
  // don't use startClient (because it will sync periodically), when we're in guest / readonly mode
  // in guest mode we only use the matrixclient to fetch initial room state, but receive updates via WebRTCProvider

  // matrixClient.startClient({ lazyLoadMembers: true });

  return matrixClient;
}
