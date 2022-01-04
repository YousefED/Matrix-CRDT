import * as encoding from "lib0/encoding";
import * as logging from "lib0/logging";
import Peer from "simple-peer";
import { announceSignalingInfo } from "./globalResources";
import { customMessage } from "./messageConstants";
import { Room } from "./Room";

const log = logging.createModuleLogger("y-webrtc");

export class WebrtcConn {
  private closed = false;
  private connected = false;
  public synced = false;

  private sendWebrtcConn(encoder: encoding.Encoder) {
    log(
      "send message to ",
      logging.BOLD,
      this.remotePeerId,
      logging.UNBOLD,
      logging.GREY,
      " (",
      this.room.name,
      ")",
      logging.UNCOLOR
    );
    try {
      this.peer.send(encoding.toUint8Array(encoder));
    } catch (e) {}
  }

  public readonly peer: Peer.Instance;
  /**
   * @param {SignalingConn} signalingConn
   * @param {boolean} initiator
   * @param {string} remotePeerId
   * @param {Room} room
   */
  constructor(
    signalingConn: any,
    initiator: boolean,
    private readonly remotePeerId: string,
    private readonly room: Room
  ) {
    log("establishing connection to ", logging.BOLD, remotePeerId);
    /**
     * @type {any}
     */
    this.peer = new Peer({ initiator, ...room.provider.peerOpts });
    this.peer.on("signal", (signal: any) => {
      // log(
      //   "signal log ",
      //   logging.BOLD,
      //   "from ",
      //   room.peerId,
      //   "to ",
      //   remotePeerId,
      //   "initiator ",
      //   initiator,
      //   "signal ",
      //   signal
      // );
      signalingConn.publishSignalingMessage(room, {
        to: remotePeerId,
        from: room.peerId,
        type: "signal",
        signal,
      });
    });
    this.peer.on("connect", () => {
      log("connected to ", logging.BOLD, remotePeerId);
      this.connected = true;
      // send sync step 1
      // const provider = room.provider;
      // const doc = provider.doc;
      // const awareness = room.awareness;
      // const encoder = encoding.createEncoder();
      // encoding.writeVarUint(encoder, messageSync);
      // syncProtocol.writeSyncStep1(encoder, doc);
      // this.sendWebrtcConn(encoder);
      room.onPeerConnected((reply) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, customMessage);
        encoding.writeVarUint8Array(encoder, reply);
        this.sendWebrtcConn(encoder);
      });

      // const awarenessStates = awareness.getStates();
      // if (awarenessStates.size > 0) {
      //   const encoder = encoding.createEncoder();
      //   encoding.writeVarUint(encoder, messageAwareness);
      //   encoding.writeVarUint8Array(
      //     encoder,
      //     awarenessProtocol.encodeAwarenessUpdate(
      //       awareness,
      //       Array.from(awarenessStates.keys())
      //     )
      //   );
      //   this.sendWebrtcConn(encoder);
      // }
    });
    this.peer.on("close", () => {
      this.connected = false;
      this.closed = true;
      if (room.webrtcConns.has(this.remotePeerId)) {
        room.webrtcConns.delete(this.remotePeerId);
        room.provider.emit("peers", [
          {
            removed: [this.remotePeerId],
            added: [],
            webrtcPeers: Array.from(room.webrtcConns.keys()),
            bcPeers: Array.from(room.bcConns),
          },
        ]);
      }
      // room.checkIsSynced();
      this.peer.destroy();
      log("closed connection to ", logging.BOLD, remotePeerId);
      announceSignalingInfo(room);
    });
    this.peer.on("error", (err: any) => {
      log("Error in connection to ", logging.BOLD, remotePeerId, ": ", err);
      announceSignalingInfo(room);
    });
    this.peer.on("data", (data: Uint8Array) => {
      log(
        "received message from ",
        logging.BOLD,
        this.remotePeerId,
        logging.GREY,
        " (",
        room.name,
        ")",
        logging.UNBOLD,
        logging.UNCOLOR
      );

      this.room.readMessage(data, (reply: encoding.Encoder) => {
        this.sendWebrtcConn(reply);
      });
    });
  }

  destroy() {
    this.peer.destroy();
  }
}
