import {
  defineCommand,
  defineConfig,
  processConfig,
  ZliError,
} from "@robingenz/zli";
import { z } from "zod";
import { login } from "./commands/login";
import { logout } from "./commands/logout";
import { providersLoginCodex } from "./commands/providers-login-codex";
import { providersLogoutCodex } from "./commands/providers-logout-codex";
import { status } from "./commands/status";

const noOptionsSchema = z.object({});

const loginCommand = defineCommand({
  description: "Log in to My Agent Loop using OAuth.",
  action: login,
});

const logoutCommand = defineCommand({
  description: "Delete local My Agent Loop OAuth tokens.",
  action: logout,
});

const statusCommand = defineCommand({
  description: "Show My Agent Loop and provider login status.",
  action: status,
});

const providersCommand = defineCommand({
  description:
    "Manage provider credentials. Usage: mal providers login codex | mal providers logout codex",
  args: z.tuple([
    z.enum(["login", "logout"]).describe("Provider action."),
    z.literal("codex").describe("Provider name."),
  ]),
  action: async (_options, args) => {
    const [action] = args;

    if (action === "login") {
      await providersLoginCodex();
      return;
    }

    await providersLogoutCodex();
  },
});

export const cliConfig = defineConfig({
  meta: {
    name: "mal",
    description: "My Agent Loop OAuth helper CLI.",
    version: "0.0.0",
  },
  commands: {
    login: loginCommand,
    logout: logoutCommand,
    status: statusCommand,
    providers: providersCommand,
  },
  defaultCommand: defineCommand({
    options: { schema: noOptionsSchema },
    action: () => {
      console.log("Run `mal --help` to see available commands.");
    },
  }),
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
      console.error("mal failed with an unknown error.");
      process.exitCode = 1;
    }
  }
}

void main();
