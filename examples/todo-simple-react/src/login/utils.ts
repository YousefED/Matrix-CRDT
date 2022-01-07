import sdk from "matrix-js-sdk";

export type LoginData = {
  server: string;
  user: string;
  roomAlias: string;
  authMethod: "password" | "token";
  password: string;
  token: string;
};

export async function createMatrixClient(data: LoginData) {
  const signInOpts = {
    baseUrl: data.server,

    userId: data.user,
  };

  const matrixClient =
    data.authMethod === "token"
      ? sdk.createClient({
          ...signInOpts,
          accessToken: data.token,
        })
      : sdk.createClient(signInOpts);

  if (data.authMethod === "token") {
    await matrixClient.loginWithToken(data.token);
  } else {
    await matrixClient.login("m.login.password", {
      user: data.user,
      password: data.password,
    });
  }

  // overwrites because we don't call .start();
  (matrixClient as any).canSupportVoip = false;
  (matrixClient as any).clientOpts = {
    lazyLoadMembers: true,
  };
  return matrixClient;
}
