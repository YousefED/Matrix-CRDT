import * as bc from "lib0/broadcastchannel";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as logging from "lib0/logging";
import { createMutex } from "lib0/mutex";
import * as random from "lib0/random";
import * as cryptoutils from "./crypto";
import { announceSignalingInfo, globalSignalingConns } from "./globalResources";
import { customMessage, messageBcPeerId } from "./messageConstants";
import { WebrtcConn } from "./WebrtcConn";
import { WebrtcProvider } from "./WebrtcProvider";

const log = logging.createModuleLogger("y-webrtc");

export class Room {
  /**
   * Do not assume that peerId is unique. This is only meant for sending signaling messages.
   */
  public readonly peerId = random.uuidv4();

  private synced = false;

  public readonly webrtcConns = new Map<string, WebrtcConn>();
  public readonly bcConns = new Set<string>();

  public readonly mux = createMutex();
  private bcconnected = false;

  private _bcSubscriber = (data: ArrayBuffer) =>
    cryptoutils.decrypt(new Uint8Array(data), this.key).then((m) =>
      this.mux(() => {
        this.readMessage(m, (reply: encoding.Encoder) => {
          this.broadcastBcMessage(encoding.toUint8Array(reply));
        });
      })
    );

  // public checkIsSynced() {
  //   let synced = true;
  //   this.webrtcConns.forEach((peer) => {
  //     if (!peer.synced) {
  //       synced = false;
  //     }
  //   });
  //   if ((!synced && this.synced) || (synced && !this.synced)) {
  //     this.synced = synced;
  //     this.provider.emit("synced", [{ synced }]);
  //     log(
  //       "synced ",
  //       logging.BOLD,
  //       this.name,
  //       logging.UNBOLD,
  //       " with all peers"
  //     );
  //   }
  // }

  public readMessage = (
    buf: Uint8Array,
    reply: (reply: encoding.Encoder) => void
  ) => {
    const decoder = decoding.createDecoder(buf);
    const encoder = encoding.createEncoder();

    const messageType = decoding.readVarUint(decoder);

    const customReply = (message: Uint8Array) => {
      encoding.writeVarUint(encoder, customMessage);
      encoding.writeVarUint8Array(encoder, message);
      reply(encoder);
    };

    switch (messageType) {
      case customMessage:
        {
          this.onCustomMessage(
            decoding.readVarUint8Array(decoder),
            customReply
          );
        }
        break;
      // case messageSync: {
      //   encoding.writeVarUint(encoder, messageSync);
      //   const syncMessageType = syncProtocol.readSyncMessage(
      //     decoder,
      //     encoder,
      //     this.doc,
      //     this
      //   );
      //   if (
      //     syncMessageType === syncProtocol.messageYjsSyncStep2 &&
      //     !this.synced
      //   ) {
      //     syncedCallback();
      //   }
      //   if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
      //     sendReply = true;
      //   }
      //   break;
      // }
      // case messageQueryAwareness:
      //   encoding.writeVarUint(encoder, messageAwareness);
      //   encoding.writeVarUint8Array(
      //     encoder,
      //     awarenessProtocol.encodeAwarenessUpdate(
      //       this.awareness,
      //       Array.from(this.awareness.getStates().keys())
      //     )
      //   );
      //   sendReply = true;
      //   break;
      // case messageAwareness:
      //   awarenessProtocol.applyAwarenessUpdate(
      //     this.awareness,
      //     decoding.readVarUint8Array(decoder),
      //     this
      //   );
      //   break;
      case messageBcPeerId: {
        const add = decoding.readUint8(decoder) === 1;
        const peerName = decoding.readVarString(decoder);
        if (
          peerName !== this.peerId &&
          ((this.bcConns.has(peerName) && !add) ||
            (!this.bcConns.has(peerName) && add))
        ) {
          const removed = [];
          const added = [];
          if (add) {
            this.bcConns.add(peerName);
            added.push(peerName);
            this.onPeerConnected(customReply);
            // if (reply) {
            //   sendReply = true;
            //   encoding.writeVarUint(encoder, customMessage);
            //   encoding.writeVarUint8Array(encoder, reply);
            // }
          } else {
            this.bcConns.delete(peerName);
            removed.push(peerName);
          }
          this.provider.emit("peers", [
            {
              added,
              removed,
              webrtcPeers: Array.from(this.webrtcConns.keys()),
              bcPeers: Array.from(this.bcConns),
            },
          ]);
          this.broadcastBcPeerId();
        }
        break;
      }
      default:
        console.error("Unable to compute message");
        return;
    }
  };

  private broadcastBcPeerId() {
    if (this.provider.filterBcConns) {
      // broadcast peerId via broadcastchannel
      const encoderPeerIdBc = encoding.createEncoder();
      encoding.writeVarUint(encoderPeerIdBc, messageBcPeerId);
      encoding.writeUint8(encoderPeerIdBc, 1);
      encoding.writeVarString(encoderPeerIdBc, this.peerId);
      this.broadcastBcMessage(encoding.toUint8Array(encoderPeerIdBc));
    }
  }

  private broadcastWebrtcConn(m: Uint8Array) {
    log("broadcast message in ", logging.BOLD, this.name, logging.UNBOLD);
    this.webrtcConns.forEach((conn) => {
      try {
        conn.peer.send(m);
      } catch (e) {}
    });
  }

  public broadcastRoomMessage(m: Uint8Array) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, customMessage);
    encoding.writeVarUint8Array(encoder, m);
    const reply = encoding.toUint8Array(encoder);

    if (this.bcconnected) {
      this.broadcastBcMessage(reply);
    }
    this.broadcastWebrtcConn(reply);
  }

  private broadcastBcMessage(m: Uint8Array) {
    return cryptoutils
      .encrypt(m, this.key)
      .then((data) => this.mux(() => bc.publish(this.name, data)));
  }

  // public readonly awareness: awarenessProtocol.Awareness;

  constructor(
    public readonly provider: WebrtcProvider,
    public readonly onCustomMessage: (
      message: Uint8Array,
      reply: (message: Uint8Array) => void
    ) => void,
    public readonly onPeerConnected: (
      reply: (message: Uint8Array) => void
    ) => void,
    public readonly name: string,
    public readonly key: CryptoKey | undefined
  ) {
    /**
     * @type {awarenessProtocol.Awareness}
     */
    // this.awareness = provider.awareness;
    // this.doc.on("update", this._docUpdateHandler);
    // this.awareness.on("update", this._awarenessUpdateHandler);
  }

  connect() {
    // signal through all available signaling connections
    announceSignalingInfo(this);
    const roomName = this.name;
    bc.subscribe(roomName, this._bcSubscriber);
    this.bcconnected = true;
    // broadcast peerId via broadcastchannel
    this.broadcastBcPeerId();
    // write sync step 1
    // const encoderSync = encoding.createEncoder();
    // encoding.writeVarUint(encoderSync, messageSync);
    // syncProtocol.writeSyncStep1(encoderSync, this.doc);
    // this.broadcastBcMessage(encoding.toUint8Array(encoderSync));
    // broadcast local state
    // const encoderState = encoding.createEncoder();
    // encoding.writeVarUint(encoderState, messageSync);
    // syncProtocol.writeSyncStep2(encoderState, this.doc);
    // this.broadcastBcMessage(encoding.toUint8Array(encoderState));
    // write queryAwareness
    // const encoderAwarenessQuery = encoding.createEncoder();
    // encoding.writeVarUint(encoderAwarenessQuery, messageQueryAwareness);
    // this.broadcastBcMessage(encoding.toUint8Array(encoderAwarenessQuery));
    // broadcast local awareness state
    // const encoderAwarenessState = encoding.createEncoder();
    // encoding.writeVarUint(encoderAwarenessState, messageAwareness);
    // encoding.writeVarUint8Array(
    //   encoderAwarenessState,
    //   awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
    //     this.doc.clientID,
    //   ])
    // );
    // this.broadcastBcMessage(encoding.toUint8Array(encoderAwarenessState));
  }

  disconnect() {
    // signal through all available signaling connections
    globalSignalingConns.forEach((conn) => {
      if (conn.connected) {
        conn.send({ type: "unsubscribe", topics: [this.name] });
      }
    });
    // awarenessProtocol.removeAwarenessStates(
    //   this.awareness,
    //   [this.doc.clientID],
    //   "disconnect"
    // );
    // broadcast peerId removal via broadcastchannel
    const encoderPeerIdBc = encoding.createEncoder();
    encoding.writeVarUint(encoderPeerIdBc, messageBcPeerId);
    encoding.writeUint8(encoderPeerIdBc, 0); // remove peerId from other bc peers
    encoding.writeVarString(encoderPeerIdBc, this.peerId);
    this.broadcastBcMessage(encoding.toUint8Array(encoderPeerIdBc));

    bc.unsubscribe(this.name, this._bcSubscriber);
    this.bcconnected = false;
    // this.doc.off("update", this._docUpdateHandler);
    // this.awareness.off("update", this._awarenessUpdateHandler);
    this.webrtcConns.forEach((conn) => conn.destroy());
  }

  destroy() {
    this.disconnect();
  }
}
