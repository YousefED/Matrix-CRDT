import { BaseStyles, ThemeProvider } from "@primer/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyMatrixSDKPolyfills } from "./fixMatrixSDK";

applyMatrixSDKPolyfills();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <BaseStyles>
        <App />
      </BaseStyles>
    </ThemeProvider>
  </React.StrictMode>
);
