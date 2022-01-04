import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs"; // eslint-disable-line
import * as logging from "lib0/logging";
import { WebrtcProvider } from "./webrtc/WebrtcProvider";
import { globalRooms } from "./webrtc/globalResources";
import { decodeBase64, encodeBase64 } from "./util/olmlib";

const log = logging.createModuleLogger("y-webrtc");

export const messageSync = 0;
export const messageQueryAwareness = 3;
export const messageAwareness = 1;

/**
 * This class implements a webrtc+broadcast channel for document updates and awareness,
 * with signed messages which should be verified.
 *
 * We use SignedWebrtcProvider to establish a "live connection" between peers,
 * so that changes by simultaneous editors are synced instantly.
 *
 * Ideally, we'd just send these over Matrix as Ephemeral events,
 * but custom ephemeral events are not supported yet.
 *
 * This implementation mimicks the original y-webrtc implementation. However:
 * - initial document state is not synced via this provider, only incremental updates
 *
 * We should probably move to ephemeral messages when that's available. Besides from that,
 * the following improvements can be made:
 * - Support a TURN server in case clients can't connect directly over WebRTC
 * - Do the signalling over Matrix, instead of the original yjs websocket server
 * - Verify the webrtc connection instead of signing / verifying every message
 * - It would be better to not depend this class on yjs (remove dependency on Y.Doc and Awareness)
 *    Instead, design it in a way that it's just a different transport for "Matrix events".
 *    This would also fix the following issue:
 *
 * Issue (non-breaking):
 *  - The original y-webrtc is designed so that document updates are send to all peers, by all peers.
 *    This means that if A, B, C, and D are connected, when A issues an update and B receives it,
 *    B will issue that same update (because it triggers a y.doc.update) and send it to all peers as well
 *    (even though most peers would have received it already).
 *    What's not cool about our implementation now is that this forward-syncing goes via the Y.Doc,
 *    i.e.: client B will create a new update and sign it itself. Which means that if B is a read-only
 *    client, all other clients will receive "invalid" messages (which could have been prevented if
 *    the message from A was forwarded directly)
 *
 * Issue (edge-case):
 * - if an update is received and validated by B, and A hasn't synced it to Matrix yet,
 *   then B will sync it to Matrix upon restart (when it syncs local changes to Matrix).
 *   This will cause an update originally from A to be sent to Matrix as authored by B
 */
export class SignedWebrtcProvider extends WebrtcProvider {
  protected onCustomMessage = (
    buf: Uint8Array,
    reply: (message: Uint8Array) => void
  ): void => {
    const decoder = decoding.createDecoder(buf);
    const encoder = encoding.createEncoder();

    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case messageSync: {
        const strMessage = decoding.readAny(decoder);
        this.verify(strMessage).then(
          () => {
            const update = decodeBase64(strMessage.message);
            const decoder2 = decoding.createDecoder(update);
            const syncMessageType = syncProtocol.readSyncMessage(
              decoder2,
              encoder,
              this.doc,
              this
            );
            if (syncMessageType !== syncProtocol.messageYjsUpdate) {
              log("error: expect only updates");
              throw new Error("error: only update messages expected");
            }
          },
          (err) => {
            console.error("couldn't verify message");
          }
        );
        break;
      }
      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this
        );
        break;
    }
    return undefined;
  };

  protected onPeerConnected = (reply: (message: Uint8Array) => void): void => {
    // awareness
    const encoder = encoding.createEncoder();
    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      reply(encoding.toUint8Array(encoder));
    }
  };

  /**
   * Listens to Yjs updates and sends them to remote peers
   */
  private _docUpdateHandler = async (update: Uint8Array, origin: any) => {
    if (!this.room) {
      return;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);

    const syncEncoder = encoding.createEncoder();
    syncProtocol.writeUpdate(syncEncoder, update);

    const obj = {
      message: encodeBase64(encoding.toUint8Array(syncEncoder)),
    };

    await this.sign(obj);

    encoding.writeAny(encoder, obj);
    this.room.broadcastRoomMessage(encoding.toUint8Array(encoder));
  };

  /**
   * Listens to Awareness updates and sends them to remote peers
   */
  private _awarenessUpdateHandler = (
    { added, updated, removed }: any,
    origin: any
  ) => {
    if (!this.room) {
      return;
    }

    const changedClients = added.concat(updated).concat(removed);
    log(
      "awareness change ",
      { added, updated, removed },
      "local",
      this.awareness.clientID
    );

    const encoderAwareness = encoding.createEncoder();
    encoding.writeVarUint(encoderAwareness, messageAwareness);
    encoding.writeVarUint8Array(
      encoderAwareness,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
    );
    this.room.broadcastRoomMessage(encoding.toUint8Array(encoderAwareness));
  };

  public constructor(
    private doc: Y.Doc,
    roomName: string,
    private roomPassword: string,
    private sign: (obj: any) => Promise<void>,
    private verify: (obj: any) => Promise<void>,
    opts?: any,
    public readonly awareness = new awarenessProtocol.Awareness(doc)
  ) {
    super(roomName, { password: roomPassword, ...opts });

    doc.on("destroy", this.destroy.bind(this));

    this.doc.on("update", this._docUpdateHandler);
    this.awareness.on("update", this._awarenessUpdateHandler);

    window.addEventListener("beforeunload", () => {
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        [doc.clientID],
        "window unload"
      );
      globalRooms.forEach((room) => {
        room.disconnect();
      });
    });
  }

  destroy() {
    this.doc.off("update", this._docUpdateHandler);
    this.awareness.off("update", this._awarenessUpdateHandler);
    this.doc.off("destroy", this.destroy);
    super.destroy();
  }
}
