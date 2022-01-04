import React from "react";
import { useSyncedStore } from "@syncedstore/react";
import { globalStore } from "./store";
import Login from "./Login";

export default function App() {
  const state = useSyncedStore(globalStore);

  return (
    <div>
      <p>Login:</p>
      <Login />
      <p>Todo items:</p>
      <ul>
        {state.todos.map((todo, i) => {
          return (
            <li
              key={i}
              style={{ textDecoration: todo.completed ? "line-through" : "" }}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onClick={() => (todo.completed = !todo.completed)}
                />
                {todo.title}
              </label>
            </li>
          );
        })}
      </ul>
      <input
        placeholder="Enter a todo item and hit enter"
        type="text"
        onKeyPress={(event) => {
          if (event.key === "Enter") {
            const target = event.target as HTMLInputElement;
            // Add a todo item using the text added in the textfield
            state.todos.push({ completed: false, title: target.value });
            target.value = "";
          }
        }}
        style={{ width: "200px", maxWidth: "100%" }}
      />
    </div>
  );
}
