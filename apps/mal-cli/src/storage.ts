import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const storedTokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  idToken: z.string().min(1).optional(),
  tokenType: z.string().optional(),
  scope: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const authFileSchema = z.object({
  mal: storedTokenSchema.optional(),
});

export type StoredToken = z.infer<typeof storedTokenSchema>;
export type AuthFile = z.infer<typeof authFileSchema>;

export function getConfigDir(): string {
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "mal-cli",
  );
}

export function getAuthFilePath(): string {
  return join(getConfigDir(), "auth.json");
}

export async function readAuthFile(): Promise<AuthFile> {
  const authFilePath = getAuthFilePath();

  try {
    const raw = await readFile(authFilePath, "utf8");
    return authFileSchema.parse(JSON.parse(raw));
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    throw error;
  }
}

export async function writeAuthFile(authFile: AuthFile): Promise<void> {
  const configDir = getConfigDir();
  const authFilePath = getAuthFilePath();

  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await chmod(configDir, 0o700);
  await writeFile(authFilePath, `${JSON.stringify(authFile, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(authFilePath, 0o600);
}

export async function clearAuthFile(): Promise<void> {
  await rm(getAuthFilePath(), { force: true });
}

export async function authFileExists(): Promise<boolean> {
  try {
    await access(getAuthFilePath(), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
