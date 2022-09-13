import * as http from "http";
import * as https from "https";
import { MatrixClient } from "matrix-js-sdk";
import { event } from "vscode-lib";
import * as Y from "yjs";
import { MatrixProvider } from "../MatrixProvider";
import { createMatrixGuestClient } from "../test-utils/matrixGuestClient";
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
  const setup = await createRandomMatrixClientAndRoom({
    permissions: "public-read-write",
    encrypted: false,
  });

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

/*
class TestReader {
  private static CREATED = 0;

  public messages: any[] | undefined;
  private reader: MatrixReader | undefined;
  constructor(
    private config: any,
    private roomId: string,
    private client?: MatrixClient
  ) {}

  async initialize() {
    const guestClient =
      this.client || (await createMatrixGuestClient(matrixTestConfig));
    this.reader = new MatrixReader(
      guestClient,
      this.roomId,
      new MatrixCRDTEventTranslator()
    );

    this.messages = await this.reader.getInitialDocumentUpdateEvents();
    console.log("created", TestReader.CREATED++);
    this.reader.onEvents((msgs) => {
      // console.log("on message");
      this.messages!.push.apply(this.messages, msgs.events);
    });
    this.reader.startPolling();
  }

  dispose() {
    this.reader?.dispose();
  }
}

// Breaks at 500 parallel requests locally
it.skip("handles parallel live messages", async () => {
  const PARALLEL = 500;
  let messageId = 0;
  const setup = await createRandomMatrixClientAndRoom({
    permissions: "public-read",
    encrypted: false,
  });

  const readers = [];
  try {
    const client = await createMatrixGuestClient(matrixTestConfig);
    for (let i = 0; i < PARALLEL; i++) {
      // const worker = new Worker(__dirname + "/worker.js", {
      //   workerData: {
      //     path: "./MatrixReader.test.ts",
      //   },
      // });
      readers.push(new TestReader(matrixTestConfig, setup.roomId, client));
    }

    // return;
    await Promise.all(readers.map((reader) => reader.initialize()));

    while (messageId < 10) {
      // console.log("send message");
      await sendMessage(setup.client, setup.roomId, "message " + ++messageId);
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));
    readers.map((r) => validateMessages(r.messages!, messageId));
  } finally {
    readers.map((r) => r.dispose());
  }
});

// gets slow at around 500 messages, but calls to http://localhost:8888/_matrix/static/ also at around 1k
it.skip("handles parallel live messages autocannon", async () => {
  const PARALLEL = 500;

  let messageId = 0;
  const setup = await createRandomMatrixClientAndRoom({
    permissions: "public-read",
    encrypted: false,
  });

  const client = await createMatrixGuestClient(matrixTestConfig);
  const reader = new MatrixReader(
    client,
    setup.roomId,
    new MatrixCRDTEventTranslator()
  );
  try {
    await reader.getInitialDocumentUpdateEvents();

    const params = {
      access_token: client.http.opts.accessToken,
      from: reader.latestToken,
      room_id: setup.roomId,
      timeout: 30000,
    };

    // send some new messages beforehand
    while (messageId < 10) {
      // console.log("send message");
      await sendMessage(setup.client, setup.roomId, "message " + ++messageId);
    }

    const uri =
      "http://" +
      HOMESERVER_NAME +
      "/_matrix/client/r0/events?" +
      qs.stringify(params);
    autocannonSeparateProcess([
      "-c",
      PARALLEL + "",
      "-a",
      PARALLEL + "",
      "-t",
      "20",
      uri,
    ]);

    // send some new messages in parallel / after
    while (messageId < 20) {
      // console.log("send message");
      await sendMessage(setup.client, setup.roomId, "message " + ++messageId);
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));
  } finally {
    reader.dispose();
  }
});
*/
