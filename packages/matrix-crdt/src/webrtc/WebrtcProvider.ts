import * as error from "lib0/error";
import * as logging from "lib0/logging";
import * as map from "lib0/map";
import * as math from "lib0/math";
import { Observable } from "lib0/observable";
import * as random from "lib0/random";
import * as cryptoutils from "./crypto";
import { globalRooms, globalSignalingConns } from "./globalResources";
import { Room } from "./Room";
import { SignalingConn } from "./SignalingConn";

const log = logging.createModuleLogger("y-webrtc");

const openRoom = (
  provider: WebrtcProvider,
  onCustomMessage: (
    message: Uint8Array,
    reply: (message: Uint8Array) => void
  ) => void,
  onPeerConnected: (reply: (message: Uint8Array) => void) => void,
  name: string,
  key: CryptoKey | undefined
) => {
  // there must only be one room
  if (globalRooms.has(name)) {
    throw error.create(`A Yjs Doc connected to room "${name}" already exists!`);
  }
  const room = new Room(provider, onCustomMessage, onPeerConnected, name, key);
  globalRooms.set(name, room);
  return room;
};

export abstract class WebrtcProvider extends Observable<string> {
  // public readonly awareness: awarenessProtocol.Awareness;
  private shouldConnect = false;
  public readonly filterBcConns: boolean = true;
  private readonly signalingUrls: string[];
  private readonly signalingConns: SignalingConn[];
  public readonly peerOpts: any;
  public readonly maxConns: number;
  private readonly key: Promise<CryptoKey | undefined>;
  protected room: Room | undefined;

  protected abstract onCustomMessage: (
    message: Uint8Array,
    reply: (message: Uint8Array) => void
  ) => void;
  protected abstract onPeerConnected: (
    reply: (message: Uint8Array) => void
  ) => void;

  constructor(
    private readonly roomName: string,

    // public readonly doc: Y.Doc,
    {
      signaling = [
        "wss://signaling.yjs.dev",
        "wss://y-webrtc-signaling-eu.herokuapp.com",
        "wss://y-webrtc-signaling-us.herokuapp.com",
      ],
      password = undefined as undefined | string,
      // awareness = new awarenessProtocol.Awareness(doc),
      maxConns = 20 + math.floor(random.rand() * 15), // the random factor reduces the chance that n clients form a cluster
      filterBcConns = true,
      peerOpts = {}, // simple-peer options. See https://github.com/feross/simple-peer#peer--new-peeropts
    } = {}
  ) {
    super();
    this.filterBcConns = filterBcConns;
    // this.awareness = awareness;
    this.shouldConnect = false;
    this.signalingUrls = signaling;
    this.signalingConns = [];
    this.maxConns = maxConns;
    this.peerOpts = { iceServers: [] };
    this.key = password
      ? cryptoutils.deriveKey(password, roomName)
      : Promise.resolve(undefined);

    this.key.then((key) => {
      this.room = openRoom(
        this,
        this.onCustomMessage,
        this.onPeerConnected,
        roomName,
        key
      );
      if (this.shouldConnect) {
        this.room.connect();
      } else {
        this.room.disconnect();
      }
    });
    this.connect();
    // this.destroy = this.destroy.bind(this);
    // doc.on("destroy", this.destroy);

    // window.addEventListener("beforeunload", () => {
    //   awarenessProtocol.removeAwarenessStates(
    //     this.awareness,
    //     [doc.clientID],
    //     "window unload"
    //   );
    //   globalRooms.forEach((room) => {
    //     room.disconnect();
    //   });
    // });
  }

  /**
   * @type {boolean}
   */
  get connected() {
    return this.room !== null && this.shouldConnect;
  }

  connect() {
    this.shouldConnect = true;
    this.signalingUrls.forEach((url) => {
      const signalingConn = map.setIfUndefined(
        globalSignalingConns,
        url,
        () => new SignalingConn(url)
      );
      this.signalingConns.push(signalingConn);
      signalingConn.providers.add(this);
    });
    if (this.room) {
      this.room.connect();
    }
  }

  disconnect() {
    this.shouldConnect = false;
    this.signalingConns.forEach((conn) => {
      conn.providers.delete(this);
      if (conn.providers.size === 0) {
        conn.destroy();
        globalSignalingConns.delete(conn.url);
      }
    });
    if (this.room) {
      this.room.disconnect();
    }
  }

  destroy() {
    // need to wait for key before deleting room
    this.key.then(() => {
      this.room?.destroy();
      globalRooms.delete(this.roomName);
    });
    super.destroy();
  }
}
