import { serve } from "@hono/node-server";
import {
  defineCommand,
  defineConfig,
  defineOptions,
  processConfig,
  ZliError,
} from "@robingenz/zli";
import { Hono } from "hono";
import openBrowser from "open";
import { z } from "zod";

const smokeSchema = z.object({
  message: z.string().default("mal-cli is scaffolded"),
});

const app = new Hono().get("/health", (context) => {
  return context.json({ ok: true });
});

const smokeCommand = defineCommand({
  description: "Run a minimal scaffold smoke command.",
  options: defineOptions(
    z.object({
      message: z
        .string()
        .default("mal-cli is scaffolded")
        .describe("Message to print."),
    }),
    { m: "message" },
  ),
  action: (options) => {
    const result = smokeSchema.parse(options);
    console.log(result.message);
  },
});

const serveCommand = defineCommand({
  description: "Start a minimal local callback server.",
  options: defineOptions(
    z.object({
      port: z.coerce
        .number()
        .int()
        .min(0)
        .max(65535)
        .default(0)
        .describe("Port to listen on."),
      open: z
        .boolean()
        .default(false)
        .describe("Open the local health endpoint in a browser."),
    }),
    { p: "port", o: "open" },
  ),
  action: async (options) => {
    const server = serve(
      {
        fetch: app.fetch,
        port: options.port,
      },
      async (address) => {
        const url = `http://localhost:${address.port}/health`;
        console.log(`Local callback server listening at ${url}`);

        if (options.open) {
          await openBrowser(url);
        }
      },
    );

    process.on("SIGINT", () => {
      server.close();
      process.exit(0);
    });
  },
});

export const cliConfig = defineConfig({
  meta: {
    name: "mal-cli",
    description: "My Agent Loop OAuth helper CLI.",
    version: "0.0.0",
  },
  commands: {
    smoke: smokeCommand,
    serve: serveCommand,
  },
});

async function main(): Promise<void> {
  try {
    const result = processConfig(cliConfig, process.argv.slice(2));
    await result.command.action(result.options, result.args);
  } catch (error: unknown) {
    if (error instanceof ZliError || error instanceof Error) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      console.error("mal-cli failed with an unknown error.");
      process.exitCode = 1;
    }
  }
}

void main();
