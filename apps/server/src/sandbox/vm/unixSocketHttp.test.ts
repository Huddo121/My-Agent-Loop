import { randomUUID } from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { unixSocketRequest } from "./unixSocketHttp";

describe("unixSocketRequest", () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
    servers.length = 0;
  });

  function listen(handler: http.RequestListener): Promise<string> {
    // Keep the name short: unix socket paths are limited to ~104 chars on macOS, and the OS temp
    // dir already uses most of that budget.
    const socketPath = path.join(
      os.tmpdir(),
      `uhx-${randomUUID().slice(0, 8)}.sock`,
    );
    const server = http.createServer(handler);
    servers.push(server);
    return new Promise((resolve) => {
      server.listen(socketPath, () => resolve(socketPath));
    });
  }

  it("resolves with the parsed JSON body on success", async () => {
    const socketPath = await listen((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ state: "Running" }));
    });
    await expect(
      unixSocketRequest(socketPath, "GET", "/vm/state"),
    ).resolves.toEqual({ state: "Running" });
  });

  it("rejects on a non-2xx status", async () => {
    const socketPath = await listen((_req, res) => {
      res.writeHead(500);
      res.end("boom");
    });
    await expect(
      unixSocketRequest(socketPath, "PUT", "/vm/state"),
    ).rejects.toThrow("failed with status 500");
  });

  it("rejects when the server never responds within the timeout", async () => {
    // The handler never writes a response, emulating a wedged VMM holding the socket open.
    const socketPath = await listen(() => {});
    await expect(
      unixSocketRequest(socketPath, "PUT", "/vm/state", { state: "Stop" }, 100),
    ).rejects.toThrow("timed out after 100ms");
  });
});
