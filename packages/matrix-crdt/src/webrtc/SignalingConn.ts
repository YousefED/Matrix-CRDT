import * as buffer from "lib0/buffer";
import * as logging from "lib0/logging";
import * as map from "lib0/map";
import * as ws from "lib0/websocket";
import * as cryptoutils from "./crypto";
import { globalRooms } from "./globalResources";
import { Room } from "./Room";
import { WebrtcConn } from "./WebrtcConn";
import { WebrtcProvider } from "./WebrtcProvider";

const log = logging.createModuleLogger("y-webrtc");

export class SignalingConn extends ws.WebsocketClient {
  public readonly providers = new Set<WebrtcProvider>();
  constructor(url: string) {
    super(url);

    this.on("connect", () => {
      log(`connected (${url})`);
      const topics = Array.from(globalRooms.keys());
      this.send({ type: "subscribe", topics });
      globalRooms.forEach((room) =>
        this.publishSignalingMessage(room, {
          type: "announce",
          from: room.peerId,
        })
      );
    });
    this.on("message", (m: any) => {
      switch (m.type) {
        case "publish": {
          const roomName = m.topic;
          const room = globalRooms.get(roomName);
          if (room == null || typeof roomName !== "string") {
            return;
          }
          const execMessage = (data: any) => {
            const webrtcConns = room.webrtcConns;
            const peerId = room.peerId;
            if (
              data == null ||
              data.from === peerId ||
              (data.to !== undefined && data.to !== peerId) ||
              room.bcConns.has(data.from)
            ) {
              // ignore messages that are not addressed to this conn, or from clients that are connected via broadcastchannel
              return;
            }
            const emitPeerChange = webrtcConns.has(data.from)
              ? () => {}
              : () =>
                  room.provider.emit("peers", [
                    {
                      removed: [],
                      added: [data.from],
                      webrtcPeers: Array.from(room.webrtcConns.keys()),
                      bcPeers: Array.from(room.bcConns),
                    },
                  ]);
            switch (data.type) {
              case "announce":
                if (webrtcConns.size < room.provider.maxConns) {
                  map.setIfUndefined(
                    webrtcConns,
                    data.from,
                    () => new WebrtcConn(this, true, data.from, room)
                  );
                  emitPeerChange();
                }
                break;
              case "signal":
                if (data.to === peerId) {
                  // log("peer.signal", data.signal);
                  map
                    .setIfUndefined(
                      webrtcConns,
                      data.from,
                      () => new WebrtcConn(this, false, data.from, room)
                    )
                    .peer.signal(data.signal);
                  emitPeerChange();
                }
                break;
            }
          };
          if (room.key) {
            if (typeof m.data === "string") {
              cryptoutils
                .decryptJson(buffer.fromBase64(m.data), room.key)
                .then(execMessage);
            }
          } else {
            execMessage(m.data);
          }
        }
      }
    });
    this.on("disconnect", () => log(`disconnect (${url})`));
  }

  public publishSignalingMessage = (room: Room, data: any) => {
    if (room.key) {
      cryptoutils.encryptJson(data, room.key).then((data) => {
        this.send({
          type: "publish",
          topic: room.name,
          data: buffer.toBase64(data),
        });
      });
    } else {
      this.send({ type: "publish", topic: room.name, data });
    }
  };
}
