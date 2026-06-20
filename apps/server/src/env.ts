import path from "node:path";
import z from "zod";
import type { AbsoluteFilePath } from "./file-system/FilePath";
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

    // Defaulted so the shared docker-compose Redis works without extra config;
    // the Portless dev wrapper overrides it for isolated worktree stacks.
    REDIS_PORT: z
      .string()
      .default("6379")
      .transform((val) => parseInt(val, 10))
      .refine((val) => !Number.isNaN(val) && val > 0 && val < 65536, {
        message: "REDIS_PORT must be a valid port number (1-65535)",
      }),

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
    MAL_RUNS_DIR: z
      .string()
      .nonempty()
      .default("./.devloop/runs")
      .transform(
        (runsDirectory): AbsoluteFilePath =>
          path.resolve(runsDirectory) as AbsoluteFilePath,
      ),

    OPENROUTER_API_KEY: harnessKey("OpenRouterApiKey"),
    ANTHROPIC_API_KEY: harnessKey("AnthropicApiKey"),
    CURSOR_API_KEY: harnessKey("CursorApiKey"),
    OPENAI_API_KEY: harnessKey("OpenAiApiKey"),

    // Forge token encryption (32-byte key as 64 hex chars or 44 base64 chars)
    FORGE_ENCRYPTION_KEY: z.string().nonempty(),

    // OAuth credential blobs at rest (32-byte key; distinct from FORGE_ENCRYPTION_KEY)
    OAUTH_CREDENTIALS_ENCRYPTION_KEY: z.string().nonempty(),

    // VM sandbox configuration
    VM_KERNEL_PATH: z.string().optional(),
    VM_ROOTFS_PATH: z.string().optional(),
    VM_INITRD_PATH: z.string().optional(),
    VIRTIOFSD_PATH: z.string().optional(),
    CLOUD_HYPERVISOR_PATH: z.string().optional(),
    VFKIT_PATH: z.string().optional(),
    // The host IP the in-VM guest uses to reach the host (driver host-API and MCP server). This is
    // platform-specific — the Linux bridge gateway vs. the macOS vmnet/NAT gateway (192.168.64.1
    // by default) — so there is deliberately no default: the operator must set it for their VM
    // platform. Optional here because VM sandboxes may be unconfigured; the VM run path validates
    // its presence and fails with a clear error if a VM run is attempted without it.
    VM_HOST_BRIDGE_IP: z.string().optional(),
    // Linux/cloud-hypervisor only: the host TAP device (attached to the bridge from
    // scripts/setup-vm-networking.sh) and the guest MAC address. Without a TAP device the VM has
    // no NIC at all, so the in-guest driver cannot reach the host; CloudHypervisorAdapter refuses
    // to start a VM without one. macOS/vfkit ignores these — it uses built-in vmnet NAT.
    VM_TAP_DEVICE: z.string().optional(),
    VM_MAC: z.string().optional(),
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
