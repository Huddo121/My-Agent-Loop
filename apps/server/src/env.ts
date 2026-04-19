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

    APP_BASE_URL: z.string().default("http://localhost:5173"),
    MCP_SERVER_URL: z
      .string()
      .url()
      .default("http://host.docker.internal:3050/mcp"),
    DRIVER_HOST_API_BASE_URL: z.string().url().optional(),
    BETTER_AUTH_SECRET: z.string().nonempty(),

    OPENROUTER_API_KEY: harnessKey("OpenRouterApiKey"),
    ANTHROPIC_API_KEY: harnessKey("AnthropicApiKey"),
    CURSOR_API_KEY: harnessKey("CursorApiKey"),
    OPENAI_API_KEY: harnessKey("OpenAiApiKey"),

    // Forge token encryption (32-byte key as 64 hex chars or 44 base64 chars)
    FORGE_ENCRYPTION_KEY: z.string().nonempty(),
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
