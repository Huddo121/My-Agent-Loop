import z from "zod";

const envSchema = z.object({
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

  OPENROUTER_API_KEY: z.string().optional(),
});

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
