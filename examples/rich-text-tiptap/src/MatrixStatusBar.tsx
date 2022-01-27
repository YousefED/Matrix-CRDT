import { Box, ChoiceInputField, Label, Radio } from "@primer/react";
import { MatrixProvider } from "matrix-crdt";
import { MatrixClient } from "matrix-js-sdk";
import React, { useState } from "react";
import { LoginButton } from "./login/LoginButton";
import * as Y from "yjs";

/**
 * The Top Bar of the app that contains the sign in button and status of the MatrixProvider (connection to the Matrix Room)
 */
export default function MatrixStatusBar({
  doc,
  awareness,
}: {
  doc: Y.Doc;
  awareness: any;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [matrixProvider, setMatrixProvider] = useState<MatrixProvider>();
  const [status, setStatus] = useState<
    "loading" | "failed" | "ok" | "disconnected"
  >();

  const [matrixClient, setMatrixClient] = useState<MatrixClient>();
  const [roomAlias, setRoomAlias] = useState<string>();

  const connect = React.useCallback(
    (matrixClient: MatrixClient, roomAlias: string) => {
      if (!matrixClient || !roomAlias) {
        throw new Error("can't connect without matrixClient or roomAlias");
      }

      // This is the main code that sets up the connection between
      // yjs and Matrix. It creates a new MatrixProvider and
      // registers it to the `doc`.
      const newMatrixProvider = new MatrixProvider(
        doc,
        matrixClient,
        { type: "alias", alias: roomAlias },
        awareness,
        {
          translator: { updatesAsRegularMessages: true },
          reader: { snapshotInterval: 10 },
          writer: { flushInterval: 500 },
          enableExperimentalWebrtcSync: true,
        }
      );
      setStatus("loading");
      newMatrixProvider.initialize();
      setMatrixProvider(newMatrixProvider);

      // (optional): capture events from MatrixProvider to reflect the status in the UI
      newMatrixProvider.onDocumentAvailable((e) => {
        setStatus("ok");
      });

      newMatrixProvider.onCanWriteChanged((e) => {
        if (!newMatrixProvider.canWrite) {
          setStatus("failed");
        } else {
          setStatus("ok");
        }
      });

      newMatrixProvider.onDocumentUnavailable((e) => {
        setStatus("failed");
      });
    },
    [doc]
  );

  const onLogin = React.useCallback(
    (matrixClient: MatrixClient, roomAlias: string) => {
      if (matrixProvider) {
        matrixProvider.dispose();
        setStatus("disconnected");
        setMatrixProvider(undefined);
      }

      // (optional) stored on state for easy disconnect + connect toggle
      setMatrixClient(matrixClient);
      setRoomAlias(roomAlias);

      // actually connect
      connect(matrixClient, roomAlias);
    },
    [matrixProvider, connect]
  );

  const onConnectChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!matrixClient || !roomAlias) {
        throw new Error("matrixClient and roomAlias should be set");
      }

      if (matrixProvider) {
        matrixProvider.dispose();
        setStatus("disconnected");
        setMatrixProvider(undefined);
      }

      if (e.target.value === "true") {
        connect(matrixClient, roomAlias);
      }
    },
    [connect, matrixClient, roomAlias, matrixProvider]
  );

  return (
    <Box textAlign={"right"}>
      {/* TODO: add options to go offline / webrtc, snapshots etc */}
      {status === undefined && (
        <LoginButton onLogin={onLogin} isOpen={isOpen} setIsOpen={setIsOpen} />
      )}
      {matrixClient && (
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <ChoiceInputField>
            <ChoiceInputField.Label>Online</ChoiceInputField.Label>
            <Radio
              name="online"
              value="true"
              defaultChecked={true}
              onChange={onConnectChange}
            />
          </ChoiceInputField>
          <ChoiceInputField>
            <ChoiceInputField.Label>
              Offline (disable sync)
            </ChoiceInputField.Label>
            <Radio
              name="online"
              value="false"
              defaultChecked={false}
              onChange={onConnectChange}
            />
          </ChoiceInputField>
        </fieldset>
      )}
      {status === "loading" && (
        <Label variant="small" outline>
          Connecting with Matrix room…
        </Label>
      )}
      {status === "disconnected" && (
        <Label variant="small" outline>
          Disconnected
        </Label>
      )}
      {status === "ok" && (
        <Label
          variant="small"
          outline
          sx={{ borderColor: "success.emphasis", color: "success.fg" }}>
          Connected with Matrix room
        </Label>
      )}
      {status === "failed" && (
        <Label
          variant="small"
          outline
          sx={{ borderColor: "danger.emphasis", color: "danger.fg" }}>
          Failed. Make sure the user has access to the Matrix room
        </Label>
      )}
    </Box>
  );
}
