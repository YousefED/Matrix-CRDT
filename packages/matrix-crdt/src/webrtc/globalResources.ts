import { Room } from "./Room";
import { SignalingConn } from "./SignalingConn";

export const globalSignalingConns = new Map<string, SignalingConn>();
export const globalRooms = new Map<string, Room>();

export function announceSignalingInfo(room: Room) {
  globalSignalingConns.forEach((conn) => {
    // only subcribe if connection is established, otherwise the conn automatically subscribes to all rooms
    if (conn.connected) {
      conn.send({ type: "subscribe", topics: [room.name] });
      if (room.webrtcConns.size < room.provider.maxConns) {
        conn.publishSignalingMessage(room, {
          type: "announce",
          from: room.peerId,
        });
      }
    }
  });
}
