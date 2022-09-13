import { beforeAll, expect, it } from "vitest";
import { event } from "vscode-lib";
import * as Y from "yjs";
import { MatrixProvider } from "./MatrixProvider";
import {
  PublicRoomPermissionType,
  RoomSecuritySetting,
} from "./matrixRoomManagement";
import { createMatrixGuestClient } from "./test-utils/matrixGuestClient";
import {
  createRandomMatrixClient,
  createRandomMatrixClientAndRoom,
  initMatrixSDK,
} from "./test-utils/matrixTestUtil";
import {
  ensureMatrixIsRunning,
  HOMESERVER_NAME,
  matrixTestConfig,
} from "./test-utils/matrixTestUtilServer";

beforeAll(async () => {
  initMatrixSDK();
  await ensureMatrixIsRunning();
});

type UnPromisify<T> = T extends Promise<infer U> ? U : T;

async function getRoomAndTwoUsers(opts: {
  bobIsGuest: boolean;
  security: RoomSecuritySetting;
}) {
  const setup = await createRandomMatrixClientAndRoom(opts.security);
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

  if (opts.security.permissions === "private") {
    // invite user to private room
    await setup.client.invite(setup.roomId, client2.credentials.userId!);
  }

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

for (let permissions of [
  "public-read-write",
  "public-read",
] as PublicRoomPermissionType[]) {
  it(`Guest is read-only for room set to ${permissions}`, async () => {
    const users = await getRoomAndTwoUsers({
      bobIsGuest: true,
      security: {
        permissions: "public-read-write",
        encrypted: false,
      },
    });
    await validateOneWaySync(users);
  }, 30000);
}

it("User is read-only for room set to public-read", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: false,
    security: {
      permissions: "public-read",
      encrypted: false,
    },
  });
  await validateOneWaySync(users);
}, 30000);

it("User can read and write for room set to public-read-write ", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: false,
    security: {
      permissions: "public-read-write",
      encrypted: false,
    },
  });
  await validateTwoWaySync(users);
}, 30000);

it("User can read and write for room set to private", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: false,
    security: {
      permissions: "private",
      encrypted: false,
    },
  });
  await validateTwoWaySync(users);
}, 30000);

it("User can read and write for room set to private, encrypted", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: false,
    security: {
      permissions: "private",
      encrypted: true,
    },
  });
  await validateTwoWaySync(users);
}, 30000);

it("syncs with intermediate snapshots ", async () => {
  const users = await getRoomAndTwoUsers({
    bobIsGuest: false,
    security: {
      permissions: "public-read-write",
      encrypted: false,
    },
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

  // validate that the snapshot system has been used
  expect(bob.provider.totalEventsReceived).toBeLessThan(20);

  alice.provider.dispose();
  bob.provider.dispose();
}, 30000);
