/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { DocWebrtcProvider } from "./DocWebrtcProvider";
import { WebRTCOptions } from "./WebrtcProvider";
import { Doc } from "yjs";
import { createRandomMatrixClientAndRoom } from "../test-utils/matrixTestUtil";
import { HOMESERVER_NAME } from "../test-utils/matrixTestUtilServer";

describe("WebrtcProvider", () => {
  it("should pass the right options to the provider", async () => {
    const { roomName } = await createRandomMatrixClientAndRoom(
      "public-read-write"
    );
    const alias = "#" + roomName + ":" + HOMESERVER_NAME;
    const withDefaults = new DocWebrtcProvider(alias, new Doc());
    //@ts-expect-error // private
    expect(withDefaults.signalingConns[0].url).toEqual(
      "wss://signaling.yjs.dev"
    );
    expect(withDefaults.filterBcConns).toEqual(true);
    expect(withDefaults.maxConns).toBeGreaterThan(20); //default is  20 + math.floor(random.rand() * 15);

    const localServer = "ws://localhost:4444";
    const options: WebRTCOptions = {
      password: "password",
      signaling: [localServer],
      maxConns: 10,
      filterBcConns: false,
    };
    const doc = new Doc();
    const provider = new DocWebrtcProvider(alias, doc, options);
    //@ts-expect-error // private
    expect(provider.signalingConns[0].url).toEqual(localServer);
    expect(provider.filterBcConns).toEqual(false);
    expect(provider.maxConns).toEqual(10);
  });
});
