import * as Y from "yjs";
import { event } from "vscode-lib";
import { createMatrixGuestClient } from "./test-utils/matrixGuestClient";
import { MatrixProvider } from "./MatrixProvider";
import {
  createRandomMatrixClient,
  createRandomMatrixClientAndRoom,
} from "./test-utils/matrixTestUtil";
import {
  ensureMatrixIsRunning,
  HOMESERVER_NAME,
  matrixTestConfig,
} from "./test-utils/matrixTestUtilServer";

jest.setTimeout(30000);

beforeAll(async () => {
  await ensureMatrixIsRunning();
});

type UnPromisify<T> = T extends Promise<infer U> ? U : T;

async function getRoomAndTwoUsers(opts: {
  bobIsGuest: boolean;
  roomAccess: "public-read-write" | "public-read";
}) {
  const setup = await createRandomMatrixClientAndRoom(opts.roomAccess);
  const doc = new Y.Doc();
  const provider = new MatrixProvider(doc, setup.client, {
    type: "alias",
    alias: "#" + setup.roomName + ":" + HOMESERVER_NAME,
  });

  const client2 = opts.bobIsGuest
    ? await createMatrixGuestClient(matrixTestConfig)
    : (await createRandomMatrixClient()).client;
  const doc2 = new Y.Doc();
  const provider2 = new MatrixProvider(doc2, client2, {
    type: "alias",
    alias: "#" + setup.roomName + ":" + HOMESERVER_NAME,
  });

  return {
    alice: {
      doc,
      provider,
      client: setup.client,
    },
    bob: {
      doc: doc2,
      provider: provider2,
      client: client2,
    },
  };
}

async function validateOneWaySync(
  users: UnPromisify<ReturnType<typeof getRoomAndTwoUsers>>
) {
  const { alice, bob } = users;
  alice.doc.getMap("test").set("contents", new Y.Text("hello"));

  alice.provider.initialize();
  await alice.provider.waitForFlush();
  await new Promise((resolve) => setTimeout(resolve, 200));
  bob.provider.initialize();

  // validate initial state
  await event.Event.toPromise(bob.provider.onDocumentAvailable);
  expect((bob.doc.getMap("test").get("contents") as any).toJSON()).toEqual(
    "hello"
  );
  expect(bob.doc.getMap("test2")).toBeUndefined;

  // send an update from provider and validate sync
  console.log("Alice sending change", alice.client.credentials.userId);
  alice.doc.getMap("test2").set("key", 1);
  await alice.provider.waitForFlush();
  await event.Event.toPromise(bob.provider.onReceivedEvents);
  expect(bob.doc.getMap("test2").get("key")).toBe(1);

  // validate bob.provider is a read-only client (because it's a guestclient)
  expect(bob.provider.canWrite).toBe(true);
  bob.doc.getMap("test3").set("key", 1);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  expect(alice.doc.getMap("test3").get("key")).toBeUndefined;
  expect(bob.provider.canWrite).toBe(false);

  alice.provider.dispose();
  bob.provider.dispose();
}

async function validateTwoWaySync(
  users: UnPromisify<ReturnType<typeof getRoomAndTwoUsers>>
) {
  const { alice, bob } = users;
  alice.doc.getMap("test").set("contents", new Y.Text("hello"));

  alice.provider.initialize();
  await alice.provider.waitForFlush();
  await new Promise((resolve) => setTimeout(resolve, 200));
  bob.provider.initialize();

  // validate initial state
  await event.Event.toPromise(bob.provider.onDocumentAvailable);
  expect((bob.doc.getMap("test").get("contents") as any).toJSON()).toEqual(
    "hello"
  );
  expect(bob.doc.getMap("test2")).toBeUndefined;

  // send an update from provider and validate sync
  console.log("Alice sending change", alice.client.credentials.userId);
  alice.doc.getMap("test2").set("key", 1);
  await alice.provider.waitForFlush();
  await event.Event.toPromise(bob.provider.onReceivedEvents);
  expect(bob.doc.getMap("test2").get("key")).toBe(1);

  // validate bob can write
  console.log("Bob sending change", bob.client.credentials.userId);
  expect(bob.provider.canWrite).toBe(true);
  bob.doc.getMap("test3").set("key", 1);
  await bob.provider.waitForFlush();
  await event.Event.toPromise(alice.provider.onReceivedEvents);
  expect(alice.doc.getMap("test3").get("key")).toBe(1);
  expect(bob.provider.canWrite).toBe(true);

  alice.provider.dispose();
  bob.provider.dispose();
}

it("syncs public room guest", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: true,
    roomAccess: "public-read-write",
  });
  await validateOneWaySync(users);
});

it("syncs write-only access", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: false,
    roomAccess: "public-read",
  });
  await validateOneWaySync(users);
});

it("syncs two users writing ", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: false,
    roomAccess: "public-read-write",
  });
  await validateTwoWaySync(users);
});

it("syncs with intermediate snapshots ", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: false,
    roomAccess: "public-read-write",
  });

  const { alice, bob } = users;

  const text = new Y.Text("hello");
  alice.doc.getMap("test").set("contents", text);

  await alice.provider.initialize();

  for (let i = 0; i < 100; i++) {
    text.insert(text.length, "-" + i);
    await alice.provider.waitForFlush();
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await bob.provider.initialize();

  const val = bob.doc.getMap("test").get("contents") as any;
  expect(val.toJSON()).toEqual(text.toJSON());
  expect(bob.provider.totalEventsReceived).toBeLessThan(20);

  alice.provider.dispose();
  bob.provider.dispose();
});
