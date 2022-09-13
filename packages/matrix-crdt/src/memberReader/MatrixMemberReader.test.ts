import { MatrixEvent } from "matrix-js-sdk";
import { beforeAll, expect, it } from "vitest";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";
import { MatrixReader } from "../reader/MatrixReader";
import { createMatrixGuestClient } from "../test-utils/matrixGuestClient";
import {
  createRandomMatrixClient,
  createRandomMatrixClientAndRoom,
  initMatrixSDK,
} from "../test-utils/matrixTestUtil";
import {
  ensureMatrixIsRunning,
  matrixTestConfig,
} from "../test-utils/matrixTestUtilServer";
import { MatrixMemberReader } from "./MatrixMemberReader";

beforeAll(async () => {
  initMatrixSDK();
  await ensureMatrixIsRunning();
});

/**
 * This test validates whether MatrixMemberReader correctly detects write access
 * when users join a room
 */
it("handles room joins", async () => {
  const setupA = await createRandomMatrixClientAndRoom({
    permissions: "public-read-write",
    encrypted: false,
  });
  const userB = await createRandomMatrixClient();
  const guestClient = await createMatrixGuestClient(matrixTestConfig);

  const readerC = new MatrixReader(
    guestClient,
    setupA.roomId,
    new MatrixCRDTEventTranslator()
  );
  const memberC = new MatrixMemberReader(guestClient, readerC);
  await readerC.getInitialDocumentUpdateEvents();
  await readerC.startPolling();
  await memberC.initialize();

  // alternative, now we use startClient, we can sync to something like this:

  // const room = setupA.client.getRoom(setupA.roomId)!;
  // expect(
  //   room.currentState.maySendEvent(
  //     "m.room.message",
  //     guestClient.credentials.userId!
  //   )
  // ).toBe(false);
  // expect(
  //   room.currentState.maySendEvent(
  //     "m.room.message",
  //     setupA.client.credentials.userId!
  //   )
  // ).toBe(true);
  // expect(
  //   room.currentState.maySendEvent(
  //     "m.room.message",
  //     userB.client.credentials.userId!
  //   )
  // ).toBe(false);

  expect(memberC.hasWriteAccess(guestClient.credentials.userId!)).toBe(false);
  expect(memberC.hasWriteAccess(setupA.client.credentials.userId!)).toBe(true);
  expect(memberC.hasWriteAccess(userB.client.credentials.userId!)).toBe(false);

  await userB.client.joinRoom(setupA.roomId);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  expect(memberC.hasWriteAccess(userB.client.credentials.userId!)).toBe(true);

  readerC.dispose();
}, 30000);

/**
 * This test checks whether MatrixMemberReader correctly checks
 * power level events to see if a user has write access or not
 */
it("handles room power levels", async () => {
  const setupA = await createRandomMatrixClientAndRoom({
    permissions: "public-read-write",
    encrypted: false,
  });
  const userB = await createRandomMatrixClient();
  const guestClient = await createMatrixGuestClient(matrixTestConfig);

  const readerC = new MatrixReader(
    guestClient,
    setupA.roomId,
    new MatrixCRDTEventTranslator()
  );
  const memberC = new MatrixMemberReader(guestClient, readerC);
  await readerC.getInitialDocumentUpdateEvents();
  await readerC.startPolling();
  await memberC.initialize();

  await userB.client.joinRoom(setupA.roomId);

  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(memberC.hasWriteAccess(setupA.client.credentials.userId!)).toBe(true);
  expect(memberC.hasWriteAccess(userB.client.credentials.userId!)).toBe(true);

  let levels = await setupA.client.getStateEvent(
    setupA.roomId,
    "m.room.power_levels",
    undefined as any
  );

  levels.events_default = 40;
  await setupA.client.sendStateEvent(
    setupA.roomId,
    "m.room.power_levels",
    levels
  );

  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(memberC.hasWriteAccess(setupA.client.credentials.userId!)).toBe(true);
  expect(memberC.hasWriteAccess(userB.client.credentials.userId!)).toBe(false);

  await setupA.client.setPowerLevel(
    setupA.roomId,
    userB.client.credentials.userId!,
    50,
    new MatrixEvent({ content: levels, type: "m.room.power_levels" })
  );

  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(memberC.hasWriteAccess(setupA.client.credentials.userId!)).toBe(true);
  expect(memberC.hasWriteAccess(userB.client.credentials.userId!)).toBe(true);

  readerC.dispose();
}, 30000);
