import { serve } from "@hono/node-server";
import { Hono } from "hono";
import openBrowser from "open";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export type OAuthCallback = {
  code: string;
  state: string;
};

export type OAuthFlowOptions = {
  authorizeUrl: string;
  expectedState: string;
  port: number;
};

export async function runOAuthFlow(
  options: OAuthFlowOptions,
): Promise<OAuthCallback> {
  const app = new Hono();
  let server: ReturnType<typeof serve> | undefined;

  const resultPromise = new Promise<OAuthCallback>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("OAuth callback timed out after 5 minutes."));
    }, CALLBACK_TIMEOUT_MS);

    const finish = (result: OAuthCallback): void => {
      clearTimeout(timeout);
      resolve(result);
    };

    const fail = (error: Error): void => {
      clearTimeout(timeout);
      reject(error);
    };

    app.get("/auth/callback", (context) => {
      const error = context.req.query("error");
      const errorDescription = context.req.query("error_description");
      if (error) {
        fail(
          new Error(
            `OAuth provider returned ${error}${
              errorDescription ? `: ${errorDescription}` : ""
            }.`,
          ),
        );
        return context.text("OAuth login failed. You can close this tab.", 400);
      }

      const code = context.req.query("code");
      const state = context.req.query("state");
      if (!code || !state) {
        fail(new Error("OAuth callback was missing code or state."));
        return context.text("OAuth callback was incomplete.", 400);
      }

      if (state !== options.expectedState) {
        fail(new Error("OAuth callback state did not match."));
        return context.text("OAuth callback state did not match.", 400);
      }

      finish({ code, state });
      return context.text("OAuth login complete. You can close this tab.");
    });

    server = serve(
      {
        fetch: app.fetch,
        port: options.port,
      },
      async () => {
        console.log(`Open this URL to continue:\n${options.authorizeUrl}`);
        try {
          await openBrowser(options.authorizeUrl);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(`Could not open a browser automatically: ${message}`);
        }
      },
    );

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        fail(
          new Error(
            `Port ${options.port} is in use; close the other process and retry.`,
          ),
        );
        return;
      }
      fail(error);
    });
  });

  try {
    return await resultPromise;
  } finally {
    server?.close();
  }
}
