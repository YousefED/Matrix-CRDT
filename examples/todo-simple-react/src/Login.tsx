import React, { useState } from "react";
import { setMatrixCredentials } from "./store";
import { DEFAULT_TOKEN } from "./token";

export default function Login() {
  const [server, setServer] = useState("https://matrix.org");
  const [user, setUser] = useState("@yousefed:matrix.org");
  const [token, setToken] = useState(DEFAULT_TOKEN);
  const [room, setRoom] = useState("#test-crdt:matrix.org");
  return (
    <div>
      <div>
        <input
          placeholder="Matrix server"
          type="text"
          style={{ width: "200px", maxWidth: "100%" }}
          onChange={(e) => setServer(e.target.value)}
          defaultValue={server}
        />
      </div>
      <div>
        <input
          placeholder="User id"
          type="text"
          style={{ width: "200px", maxWidth: "100%" }}
          onChange={(e) => setUser(e.target.value)}
          defaultValue={user}
        />
      </div>
      <div>
        <input
          placeholder="accessToken"
          type="password"
          style={{ width: "200px", maxWidth: "100%" }}
          onChange={(e) => setToken(e.target.value)}
          defaultValue={token}
        />
      </div>
      <div>
        <input
          placeholder="room"
          type="text"
          style={{ width: "200px", maxWidth: "100%" }}
          onChange={(e) => setRoom(e.target.value)}
          defaultValue={room}
        />
      </div>
      <div>
        <button onClick={() => setMatrixCredentials(server, user, token, room)}>
          Login
        </button>
      </div>
    </div>
  );
}
