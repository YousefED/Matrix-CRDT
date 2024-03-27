import { MatrixClient } from "matrix-js-sdk";
import * as qs from "qs";
import { beforeAll, expect, it } from "vitest";
import { autocannonSeparateProcess } from "../benchmark/util";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
import { createMatrixGuestClient } from "../test-utils/matrixGuestClient";
import { createRandomMatrixClientAndRoom } from "../test-utils/matrixTestUtil";
import {
  ensureMatrixIsRunning,
  HOMESERVER_NAME,
  matrixTestConfig,
} from "../test-utils/matrixTestUtilServer";
import { sendMessage } from "../util/matrixUtil";
import { MatrixReader } from "./MatrixReader";

const { Worker, isMainThread } = require("worker_threads");

beforeAll(async () => {
  await ensureMatrixIsRunning();
});

function validateMessages(messages: any[], count: number) {
  expect(messages.length).toBe(count);
  for (let i = 1; i <= count; i++) {
    expect(messages[i - 1].content.body).toEqual("message " + i);
  }
}

it("handles initial and live messages", async () => {
  let messageId = 0;
  const setup = await createRandomMatrixClientAndRoom("public-read");

  // send more than 1 page (30 messages) initially
  for (let i = 0; i < 40; i++) {
    await sendMessage(setup.client, setup.roomId, "message " + ++messageId);
  }

  const guestClient = await createMatrixGuestClient(matrixTestConfig);
  const reader = new MatrixReader(
    guestClient,
    setup.roomId,
    new MatrixCRDTEventTranslator()
  );
  try {
    const messages = await reader.getInitialDocumentUpdateEvents(
      "m.room.message"
    );

    reader.onEvents((msgs) => {
      messages.push.apply(
        messages,
        msgs.events.filter((e) => e.type === "m.room.message")
      );
    });
    reader.startPolling();

    while (messageId < 60) {
      await sendMessage(setup.client, setup.roomId, "message " + ++messageId);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    validateMessages(messages, messageId);
  } finally {
    reader.dispose();
  }
}, 100000);

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
  const setup = await createRandomMatrixClientAndRoom("public-read");

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
  const setup = await createRandomMatrixClientAndRoom("public-read");

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
