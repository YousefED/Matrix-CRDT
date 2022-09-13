import got from "got";
import { MatrixClient, request } from "matrix-js-sdk";
import { beforeAll, expect, it } from "vitest";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
import { RoomSecuritySetting } from "../matrixRoomManagement";
import { createMatrixGuestClient } from "../test-utils/matrixGuestClient";
import {
  createRandomMatrixClient,
  createRandomMatrixClientAndRoom,
} from "../test-utils/matrixTestUtil";
import {
  ensureMatrixIsRunning,
  matrixTestConfig,
} from "../test-utils/matrixTestUtilServer";
import { sendMessage } from "../util/matrixUtil";
import { MatrixReader } from "./MatrixReader";

const { Worker, isMainThread } = require("worker_threads");

// change http client in matrix, this is faster than request when we have many outgoing requests
request((opts: any, cb: any) => {
  opts.url = opts.url || opts.uri;
  opts.searchParams = opts.qs;
  opts.decompress = opts.gzip;
  // opts.responseType = "json";
  opts.throwHttpErrors = false;
  if (!opts.json) {
    delete opts.json;
  }
  const responsePromise = got(opts);
  const ret = responsePromise.then(
    (response) => {
      cb(undefined, response, response.body);
    },
    (e) => {
      cb(e, e.response, e.response.body);
    }
  );
  (ret as any).abort = responsePromise.cancel;
  return ret;
});

beforeAll(async () => {
  await ensureMatrixIsRunning();
});

async function getRoomAndTwoUsers(opts: {
  bobIsGuest: boolean;
  security: RoomSecuritySetting;
}) {
  const setup = await createRandomMatrixClientAndRoom(opts.security);

  const client2 = opts.bobIsGuest
    ? await createMatrixGuestClient(matrixTestConfig)
    : (await createRandomMatrixClient()).client;

  if (opts.security.permissions === "private") {
    // invite user to private room
    await setup.client.invite(setup.roomId, client2.credentials.userId!);
  }

  return {
    alice: {
      client: setup.client,
      roomId: setup.roomId,
    },
    bob: {
      client: client2,
    },
  };
}

function validateMessages(messages: any[], count: number) {
  expect(messages.length).toBe(count);
  for (let i = 1; i <= count; i++) {
    expect(messages[i - 1].content.body).toEqual("message " + i);
  }
}

it("handles initial and live messages (public room)", async () => {
  let messageId = 0;

  const { alice, bob } = await getRoomAndTwoUsers({
    bobIsGuest: false,
    security: {
      permissions: "public-read-write",
      encrypted: false,
    },
  });

  await validateMessagesSentByAliceReceivedByBob(alice, messageId, bob);
}, 100000);

it("handles initial and live messages (private encrypted room)", async () => {
  let messageId = 0;

  const { alice, bob } = await getRoomAndTwoUsers({
    bobIsGuest: false,
    security: {
      permissions: "private",
      encrypted: true,
    },
  });

  await validateMessagesSentByAliceReceivedByBob(alice, messageId, bob);
}, 100000);

async function validateMessagesSentByAliceReceivedByBob(
  alice: { client: MatrixClient; roomId: string },
  messageId: number,
  bob: { client: MatrixClient }
) {
  // send more than 1 page (30 messages) initially
  for (let i = 0; i < 40; i++) {
    await sendMessage(alice.client, alice.roomId, "message " + ++messageId);
  }

  const reader = new MatrixReader(
    bob.client,
    alice.roomId,
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
      await sendMessage(alice.client, alice.roomId, "message " + ++messageId);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    validateMessages(messages, messageId);
  } finally {
    reader.dispose();
  }
}
