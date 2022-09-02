import * as cp from "child_process";
import fetch from "cross-fetch";

export const MATRIX_HOME_URL = new URL("http://localhost:8888/_matrix/static/");

export const HOMESERVER_NAME = "localhost:8888";
export const matrixTestConfig = {
  baseUrl: "http://" + HOMESERVER_NAME,
  // idBaseUrl: "https://vector.im",
};

let matrixStarted = false;

async function hasMatrixStarted() {
  try {
    await fetch(MATRIX_HOME_URL.toString());
    return true;
  } catch (e) {
    return false;
  }
}

async function waitForMatrixStart() {
  while (true) {
    console.log("Waiting for Matrix to start...");
    if (await hasMatrixStarted()) {
      console.log("Matrix has started!");
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }
}

export async function ensureMatrixIsRunning() {
  if (!matrixStarted) {
    if (await hasMatrixStarted()) {
      matrixStarted = true;
    }
  }

  if (
    !matrixStarted &&
    (!process.env.CI || process.env.CI === "vscode-jest-tests")
  ) {
    matrixStarted = true;
    console.log("Starting matrix using docker-compose");
    const ret = cp.execSync("docker compose up -d", {
      cwd: "../../test-server/",
    });
    console.log(ret.toString("utf-8"));
  }

  await waitForMatrixStart();
}
