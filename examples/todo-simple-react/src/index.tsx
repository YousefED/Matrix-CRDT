import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { ThemeProvider, BaseStyles } from "@primer/react";
ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider>
      <BaseStyles>
        <App />
      </BaseStyles>
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
