import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs"; // eslint-disable-line
import { globalRooms } from "./globalResources";
import { WebrtcProvider } from "./WebrtcProvider";
import * as logging from "lib0/logging";

const log = logging.createModuleLogger("y-webrtc");

export const messageSync = 0;
export const messageQueryAwareness = 3;
export const messageAwareness = 1;

export class DocWebrtcProvider extends WebrtcProvider {
  protected onCustomMessage = (
    buf: Uint8Array,
    reply: (message: Uint8Array) => void
  ): void => {
    const decoder = decoding.createDecoder(buf);
    const encoder = encoding.createEncoder();

    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync);
        const syncMessageType = syncProtocol.readSyncMessage(
          decoder,
          encoder,
          this.doc,
          this
        );
        // if (
        //   syncMessageType === syncProtocol.messageYjsSyncStep2 &&
        //   !this.synced
        // ) {
        //   syncedCallback();
        // }
        if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
          // sendReply = true;
          reply(encoding.toUint8Array(encoder));
        }
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
    const encoder = encoding.createEncoder();

    // write sync step 1
    // TODO: difference: bc used to immediately send syncstep1 + syncstep2
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    reply(encoding.toUint8Array(encoder));

    // awareness
    // TODO: difference: bc used to only send own awareness state (this.doc.clientId)
    const encoder2 = encoding.createEncoder();
    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      encoding.writeVarUint(encoder2, messageAwareness);
      encoding.writeVarUint8Array(
        encoder2,
        awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      reply(encoding.toUint8Array(encoder2));
    }

    // old bc code:
    // const encoderAwarenessState = encoding.createEncoder();
    // encoding.writeVarUint(encoderAwarenessState, messageAwareness);
    // encoding.writeVarUint8Array(
    //   encoderAwarenessState,
    //   awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
    //     this.doc.clientID,
    //   ])
    // );
    // this.broadcastBcMessage(encoding.toUint8Array(encoderAwarenessState));

    return undefined;
  };

  /**
   * Listens to Yjs updates and sends them to remote peers
   */
  private _docUpdateHandler = (update: Uint8Array, origin: any) => {
    if (!this.room) {
      return;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
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

  constructor(
    roomName: string,
    private readonly doc: Y.Doc,
    opts?: any,
    public readonly awareness = new awarenessProtocol.Awareness(doc)
  ) {
    super(roomName, opts);

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
