import autocannon from "autocannon";
import * as http from "http";
import * as cp from "child_process";

export async function createSimpleServer(
  handler: (req: any, res: any) => Promise<void>,
  port = 8080
) {
  const requestListener = async function (req: any, res: any) {
    try {
      await handler(req, res);
      res.writeHead(200);
      res.end("Success!");
    } catch (e) {
      console.log(e);
      res.writeHead(500);
      res.end("Error");
    }
  };

  const server = http.createServer(requestListener);
  server.maxConnections = 10000;
  server.listen(port);
  return server;
}

export async function runAutocannonFromNode(url: string) {
  const result = await autocannon({
    url,
    connections: 10, // default
    pipelining: 1, // default
    duration: 10, // default
  });
  const ret = (autocannon as any).printResult(result, {
    renderLatencyTable: false,
    renderResultsTable: true,
  });
  console.log(ret);
}

export async function autocannonSeparateProcess(params: string[]) {
  console.log("autocannonSeparateProcess");

  const ls = cp.spawn("./node_modules/.bin/autocannon", params);
  return new Promise<void>((resolve) => {
    ls.stdout.on("data", (data: any) => {
      console.log(`stdout: ${data}`);
    });

    ls.stderr.on("data", (data: any) => {
      console.log(`stderr: ${data}`);
    });

    ls.on("close", (code: any) => {
      console.log(`child process exited with code ${code}`);
      resolve();
    });
  });
}
