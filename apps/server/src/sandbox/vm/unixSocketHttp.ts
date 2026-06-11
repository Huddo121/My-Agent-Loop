import http from "node:http";

// The VMM REST APIs answer locally and immediately; a request that takes this long means the VMM
// is wedged. Bounding it matters most for shutdownVm — stopSandbox awaits that call before its
// 30s force-kill grace period starts, so an unbounded hang here would stall teardown forever.
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Makes an HTTP request over a Unix domain socket.
 *
 * The `host` header is set to "localhost" as a placeholder — HTTP/1.1 requires a
 * Host header, and the VMM REST APIs accept any value since they only listen on a
 * private socket.
 */
export function unixSocketRequest(
  socketPath: string,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    const options: http.RequestOptions = {
      socketPath,
      host: "localhost",
      method,
      path,
      headers: {
        "Content-Type": "application/json",
        ...(bodyStr !== undefined
          ? { "Content-Length": Buffer.byteLength(bodyStr) }
          : {}),
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");

        if (res.statusCode === undefined || res.statusCode >= 300) {
          reject(
            new Error(
              `Unix socket HTTP ${method} ${path} failed with status ${res.statusCode ?? "unknown"}: ${raw}`,
            ),
          );
          return;
        }

        if (raw.length === 0) {
          resolve(undefined);
          return;
        }

        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(
            new Error(
              `Failed to parse JSON response from ${method} ${path}: ${raw}`,
            ),
          );
        }
      });
    });

    req.on("error", reject);

    // Destroying the request makes it emit "error" with the passed reason, which rejects above.
    // Covers both a connect that never completes and a response that never arrives.
    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(
          `Unix socket HTTP ${method} ${path} timed out after ${timeoutMs}ms`,
        ),
      );
    });

    if (bodyStr !== undefined) {
      req.write(bodyStr);
    }

    req.end();
  });
}
