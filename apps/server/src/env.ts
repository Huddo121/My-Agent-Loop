import z from "zod";
import type { Branded } from "./utils/Branded";
import { ProtectedString } from "./utils/ProtectedString";

export type HarnessApiKey<B extends string> = ProtectedString &
  Branded<ProtectedString, B>;

const harnessKey = <B extends string>(_brand: B) =>
  z
    .string()
    .optional()
    .transform((v): HarnessApiKey<B> | undefined =>
      v ? (new ProtectedString(v) as HarnessApiKey<B>) : undefined,
    );

const envSchema = z
  .object({
    // Database
    DATABASE_URL: z.string().nonempty(),

    REDIS_HOST: z.string().nonempty(),

    // Server
    PORT: z
      .string()
      .default("3000")
      .transform((val) => parseInt(val, 10))
      .refine((val) => !Number.isNaN(val) && val > 0 && val < 65536, {
        message: "PORT must be a valid port number (1-65535)",
      }),

    // Environment
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    // Development defaults only. Production must use the public HTTPS origin.
    APP_BASE_URL: z.string().default("http://localhost:5173"),
    // Sandboxes use host.docker.internal during local development. Production
    // overrides both URLs with the server's mal-sandbox-net service DNS name.
    MCP_SERVER_URL: z
      .string()
      .url()
      .default("http://host.docker.internal:3050/mcp"),
    DRIVER_HOST_API_BASE_URL: z.string().url().optional(),
    BETTER_AUTH_SECRET: z.string().nonempty(),

    // Host directory that per-run working directories (repo checkout, task.txt,
    // harness config, lifecycle.sh) are created under. When the server runs in a
    // container this must be a host path mounted in at the identical path, so the
    // bind mounts the server requests for each sandbox resolve on the host.
    MAL_RUNS_DIR: z.string().nonempty().default("./.devloop/runs"),

    OPENROUTER_API_KEY: harnessKey("OpenRouterApiKey"),
    ANTHROPIC_API_KEY: harnessKey("AnthropicApiKey"),
    CURSOR_API_KEY: harnessKey("CursorApiKey"),
    OPENAI_API_KEY: harnessKey("OpenAiApiKey"),

    // Forge token encryption (32-byte key as 64 hex chars or 44 base64 chars)
    FORGE_ENCRYPTION_KEY: z.string().nonempty(),

    // OAuth credential blobs at rest (32-byte key; distinct from FORGE_ENCRYPTION_KEY)
    OAUTH_CREDENTIALS_ENCRYPTION_KEY: z.string().nonempty(),
  })
  .transform((env) => ({
    ...env,
    DRIVER_HOST_API_BASE_URL:
      env.DRIVER_HOST_API_BASE_URL ?? `http://host.docker.internal:${env.PORT}`,
  }));

export type Env = z.infer<typeof envSchema>;

const loadEnv = (): Env => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
};

export const env = loadEnv();
