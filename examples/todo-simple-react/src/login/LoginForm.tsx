import {
  Box,
  ChoiceInputField,
  FormGroup,
  InputField,
  Radio,
  TextInput,
  Flash,
} from "@primer/react";
import React, { useState } from "react";
import { DEFAULT_TOKEN } from "../token";
import { LoginData } from "./utils";

export default function LoginForm({
  setLoginData,
  status,
}: {
  setLoginData: (data: LoginData) => void;
  status: "loading" | "failed" | "ok";
}) {
  const [server, setServer] = useState("https://matrix.org");
  const [user, setUser] = useState("@yousefed:matrix.org");
  const [token, setToken] = useState(DEFAULT_TOKEN);
  const [password, setPassword] = useState("6fFf-BQi7wZdGLN7Y");
  const [roomAlias, setRoomAlias] = useState("#matrix-crdt-test:matrix.org");
  const [authMethod, setAuthMethod] = useState<"password" | "token">(
    "password"
  );
  const [validationResult, setValidationResult] = useState<
    "format" | "prefix"
  >();

  React.useEffect(() => {
    if (!/#matrix-crdt-.*/.test(roomAlias)) {
      setValidationResult("prefix");
    } else if (!/#.+:.+/.test(roomAlias)) {
      setValidationResult("format");
    } else {
      setValidationResult(undefined);
    }
  }, [roomAlias]);

  React.useEffect(() => {
    setLoginData({
      server,
      user,
      token,
      password,
      roomAlias,
      authMethod,
    });
  }, [setLoginData, server, user, token, password, roomAlias, authMethod]);

  return (
    <div>
      <Box sx={{ maxWidth: 400 }}>
        {status === "failed" && <Flash variant="danger">Sign in failed</Flash>}
        <FormGroup>
          <InputField required>
            <InputField.Label>Homeserver:</InputField.Label>
            <TextInput
              onChange={(e: any) => setServer(e.target.value)}
              defaultValue={server}
            />
          </InputField>
        </FormGroup>
        <FormGroup>
          <InputField required>
            <InputField.Label>Matrix user id:</InputField.Label>
            <TextInput
              onChange={(e: any) => setUser(e.target.value)}
              defaultValue={user}
              placeholder="e.g.: @yousefed:matrix.org"
            />
          </InputField>
        </FormGroup>
        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <ChoiceInputField>
            <ChoiceInputField.Label>
              Sign in with password
            </ChoiceInputField.Label>
            <Radio
              name="authMethod"
              value="password"
              defaultChecked={authMethod === "password"}
              onChange={(e: any) => setAuthMethod(e.target.value)}
            />
          </ChoiceInputField>
          <ChoiceInputField>
            <ChoiceInputField.Label>
              Sign in with Access Token
            </ChoiceInputField.Label>
            <Radio
              name="authMethod"
              value="token"
              defaultChecked={authMethod === "token"}
              onChange={(e: any) => setAuthMethod(e.target.value)}
            />
          </ChoiceInputField>
        </fieldset>
        {authMethod === "token" && (
          <FormGroup>
            <InputField required>
              <InputField.Label>Access token:</InputField.Label>
              <TextInput
                type="password"
                onChange={(e: any) => setToken(e.target.value)}
                defaultValue={token}
              />
              <InputField.Caption>
                You can find your access token in Element Settings -&gt; Help &
                About. Your access token is only shared with the Matrix server.
              </InputField.Caption>
            </InputField>
          </FormGroup>
        )}
        {authMethod === "password" && (
          <FormGroup>
            <InputField required>
              <InputField.Label>Password:</InputField.Label>
              <TextInput
                name="matrixPassword"
                type="password"
                onChange={(e: any) => setPassword(e.target.value)}
                defaultValue={password}
              />
              <InputField.Caption>
                Your password is only shared with the Matrix server.
              </InputField.Caption>
            </InputField>
          </FormGroup>
        )}
        <FormGroup>
          <InputField
            required
            validationMap={{
              prefix: "error",
              format: "error",
            }}
            validationResult={validationResult}>
            <InputField.Label>Room alias:</InputField.Label>
            <TextInput
              onChange={(e: any) => setRoomAlias(e.target.value)}
              defaultValue={roomAlias}
              placeholder="e.g.: #matrix-crdt-test:matrix.org"
            />
            <InputField.Validation validationKey="prefix">
              The room alias must start "#matrix-crdt-" for testing purposes.
            </InputField.Validation>
            <InputField.Validation validationKey="format">
              Room aliases should be of the format #alias:server.tld
            </InputField.Validation>
            <InputField.Caption>
              The room that application state will be synced with.
            </InputField.Caption>
          </InputField>
        </FormGroup>
        {/* <ButtonPrimary
          onClick={() => setMatrixCredentials(server, user, token, roomAlias)}>
          Sign in
        </ButtonPrimary> */}
      </Box>
    </div>
  );
}
