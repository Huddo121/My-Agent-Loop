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

function getBaseConfigDir(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function getConfigDir(): string {
  return join(getBaseConfigDir(), "mal");
}

export function getAuthFilePath(): string {
  return join(getConfigDir(), "auth.json");
}

function getLegacyAuthFilePath(): string {
  return join(getBaseConfigDir(), "mal-cli", "auth.json");
}

async function readStoredAuthFile(authFilePath: string): Promise<AuthFile> {
  const raw = await readFile(authFilePath, "utf8");
  return authFileSchema.parse(JSON.parse(raw));
}

export async function readAuthFile(): Promise<AuthFile> {
  const authFilePath = getAuthFilePath();

  try {
    return await readStoredAuthFile(authFilePath);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      try {
        return await readStoredAuthFile(getLegacyAuthFilePath());
      } catch (legacyError: unknown) {
        if (
          typeof legacyError === "object" &&
          legacyError !== null &&
          "code" in legacyError &&
          legacyError.code === "ENOENT"
        ) {
          return {};
        }
        throw legacyError;
      }
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
  await Promise.all([
    rm(getAuthFilePath(), { force: true }),
    rm(getLegacyAuthFilePath(), { force: true }),
  ]);
}

export async function authFileExists(): Promise<boolean> {
  try {
    await access(getAuthFilePath(), constants.F_OK);
    return true;
  } catch {
    try {
      await access(getLegacyAuthFilePath(), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
