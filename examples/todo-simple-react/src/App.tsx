import { Box, Checkbox, Heading, Text, TextInput } from "@primer/react";
import { getYjsValue } from "@syncedstore/core";
import { useSyncedStore } from "@syncedstore/react";
import { MatrixProvider } from "matrix-crdt";
import { MatrixClient } from "matrix-js-sdk";
import React, { useState } from "react";
import { LoginButton } from "./login/LoginButton";
import { globalStore } from "./store";
export default function App() {
  const state = useSyncedStore(globalStore);
  const [isOpen, setIsOpen] = useState(false);
  const [matrixProvider, setMatrixProvider] = useState<MatrixProvider>();

  // Called when a MatrixClient is available (provided by LoginButton)
  const setMatrixClient = React.useCallback(
    (matrixClient: MatrixClient, roomAlias: string) => {
      if (matrixProvider) {
        matrixProvider.dispose();
      }
      const newMatrixProvider = new MatrixProvider(
        getYjsValue(globalStore) as any,
        matrixClient,
        { type: "alias", alias: roomAlias },
        undefined,
        {
          translator: { updatesAsRegularMessages: true },
          reader: { snapshotInterval: 10 },
          writer: { flushInterval: 500 },
        }
      );
      newMatrixProvider.initialize(); // TODO: show status
      setMatrixProvider(newMatrixProvider);
    },
    [matrixProvider]
  );

  return (
    <Box m={3} maxWidth={600} marginLeft={"auto"} marginRight={"auto"} p={3}>
      <Box textAlign={"right"}>
        {/* TODO: add options to go offline / webrtc, snapshots etc */}
        <LoginButton
          setMatrixClient={setMatrixClient}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
        />
      </Box>

      <Heading sx={{ mb: 2 }}>Todo items:</Heading>

      <TextInput
        block
        placeholder="Enter a todo item and hit enter"
        type="text"
        name="todo"
        sx={{ marginBottom: 2 }}
        onKeyPress={(event: any) => {
          if (event.key === "Enter" && event.target.value) {
            const target = event.target as HTMLInputElement;
            // Add a todo item using the text added in the textfield
            state.todos.push({ completed: false, title: target.value });
            target.value = "";
          }
        }}
      />

      {state.todos.map((todo, i) => {
        return (
          <Box
            as="form"
            sx={{ display: "flex", alignItems: "center" }}
            key={`cb-${i}`}>
            <Checkbox
              id={`cb-${i}`}
              checked={todo.completed}
              onChange={() => (todo.completed = !todo.completed)}
            />
            <Text
              as="label"
              htmlFor={`cb-${i}`}
              sx={{ fontSize: 3, marginLeft: 1 }}>
              {todo.title}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
