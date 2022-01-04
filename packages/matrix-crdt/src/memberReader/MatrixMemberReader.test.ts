import { MatrixEvent } from "matrix-js-sdk";

import { createMatrixGuestClient } from "../test-utils/matrixGuestClient";
import { MatrixMemberReader } from "./MatrixMemberReader";
import { MatrixReader } from "../reader/MatrixReader";
import {
  createRandomMatrixClient,
  createRandomMatrixClientAndRoom,
} from "../test-utils/matrixTestUtil";
import {
  ensureMatrixIsRunning,
  matrixTestConfig,
} from "../test-utils/matrixTestUtilServer";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";

jest.setTimeout(30000);

beforeAll(async () => {
  await ensureMatrixIsRunning();
});

it("handles room joins", async () => {
  const setupA = await createRandomMatrixClientAndRoom("public-read-write");
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

  expect(memberC.hasWriteAccess(guestClient.credentials.userId)).toBe(false);
  expect(memberC.hasWriteAccess(setupA.client.credentials.userId)).toBe(true);
  expect(memberC.hasWriteAccess(userB.client.credentials.userId)).toBe(false);

  await userB.client.joinRoom(setupA.roomId);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  expect(memberC.hasWriteAccess(userB.client.credentials.userId)).toBe(true);

  readerC.dispose();
});

it("handles room power levels", async () => {
  const setupA = await createRandomMatrixClientAndRoom("public-read-write");
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
  expect(memberC.hasWriteAccess(setupA.client.credentials.userId)).toBe(true);
  expect(memberC.hasWriteAccess(userB.client.credentials.userId)).toBe(true);

  let levels = await setupA.client.getStateEvent(
    setupA.roomId,
    "m.room.power_levels"
  );

  levels.events_default = 40;
  await setupA.client.sendStateEvent(
    setupA.roomId,
    "m.room.power_levels",
    levels
  );

  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(memberC.hasWriteAccess(setupA.client.credentials.userId)).toBe(true);
  expect(memberC.hasWriteAccess(userB.client.credentials.userId)).toBe(false);

  await setupA.client.setPowerLevel(
    setupA.roomId,
    userB.client.credentials.userId,
    50,
    new MatrixEvent({ content: levels, type: "m.room.power_levels" })
  );

  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(memberC.hasWriteAccess(setupA.client.credentials.userId)).toBe(true);
  expect(memberC.hasWriteAccess(userB.client.credentials.userId)).toBe(true);

  readerC.dispose();
});
