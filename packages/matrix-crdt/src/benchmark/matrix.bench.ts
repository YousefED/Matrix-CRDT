import * as http from "http";
import * as https from "https";
import { MatrixClient } from "matrix-js-sdk";
import * as Y from "yjs";
import { event } from "vscode-lib";
import { createMatrixGuestClient } from "../test-utils/matrixGuestClient";
import { MatrixProvider } from "../MatrixProvider";
import { createRandomMatrixClientAndRoom } from "../test-utils/matrixTestUtil";
import {
  HOMESERVER_NAME,
  matrixTestConfig,
} from "../test-utils/matrixTestUtilServer";
import { createSimpleServer, runAutocannonFromNode } from "./util";
http.globalAgent.maxSockets = 2000;
https.globalAgent.maxSockets = 2000;

async function setRoomContents(client: MatrixClient, roomName: string) {
  const doc = new Y.Doc();
  doc.getMap("test").set("contents", new Y.Text("hello"));
  const provider = new MatrixProvider(doc, client, {
    type: "alias",
    alias: "#" + roomName + ":" + HOMESERVER_NAME,
  });
  provider.initialize();
  await provider.waitForFlush();
}

let client: any;
async function readRoom(roomName: string) {
  if (!client) {
    client = await createMatrixGuestClient(matrixTestConfig);
  }
  const doc = new Y.Doc();
  const provider = new MatrixProvider(doc, client, {
    type: "alias",
    alias: "#" + roomName + ":" + HOMESERVER_NAME,
  });
  provider.initialize();
  await event.Event.toPromise(provider.onDocumentAvailable);
  const text = doc.getMap("test").get("contents") as Y.Text;
  if (text.toJSON() !== "hello") {
    throw new Error("invalid contents of ydoc");
  }
  provider.dispose();
}

async function loadTest() {
  const setup = await createRandomMatrixClientAndRoom("public-read-write");

  await setRoomContents(setup.client, setup.roomId);
  const server = await createSimpleServer(() => readRoom(setup.roomName));
  await runAutocannonFromNode("http://localhost:8080");
  server.close();
}

// it("basic replace", async () => {
//   //   const testId = Math.round(Math.random() * 10000);
//   //   const username = "testuser_" + testId;
//   //   const roomName = "@" + username + "/test";

//   //   await createRoom(username, roomName);
//   //   await readRoom(roomName);
//   await loadTest();
// }, 30000);
loadTest();
