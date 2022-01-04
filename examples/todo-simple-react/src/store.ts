import { getYjsValue, syncedStore } from "@syncedstore/core";
import { MatrixProvider } from "matrix-crdt";
import sdk from "matrix-js-sdk";

export type Todo = {
  title: string;
  completed: boolean;
};

export const globalStore = syncedStore({ todos: [] as Todo[] });
// new MatrixProvider(getYjsValue(globalStore) as any, client, {}
let matrixProvider: MatrixProvider | undefined;
export function setMatrixCredentials(
  server: string,
  userId: string,
  token: string,
  room: string
) {
  if (matrixProvider) {
    matrixProvider.dispose();
  }
  const matrixClient = sdk.createClient({
    baseUrl: server,
    accessToken: token,
    userId,
  });
  // overwrites because we don't call .start();
  (matrixClient as any).canSupportVoip = false;
  (matrixClient as any).clientOpts = {
    lazyLoadMembers: true,
  };

  matrixClient.loginWithToken(token);

  matrixProvider = new MatrixProvider(
    getYjsValue(globalStore) as any,
    matrixClient,
    { type: "alias", alias: room },
    undefined,
    {
      translator: { updatesAsRegularMessages: true },
      reader: { snapshotInterval: 10 },
      writer: { flushInterval: 500 },
    }
  );
  matrixProvider.initialize();
}
