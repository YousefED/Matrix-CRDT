import { MatrixClient } from "matrix-js-sdk";

export const MESSAGE_EVENT_TYPE = "m.room.message";

export async function sendMessage(
  client: MatrixClient,
  roomId: string,
  message: string,
  eventType = MESSAGE_EVENT_TYPE
) {
  const content = {
    body: message,
    msgtype: "m.text",
  };
  client.scheduler = undefined;
  await client.sendEvent(roomId, eventType, content, "");
}
