import { listHarnessCredentials } from "../api";
import { getConfig } from "../config";
import { needsMalTokenRefresh } from "../oauth";
import { readAuthFile } from "../storage";

export async function status(): Promise<void> {
  const config = getConfig();
  const authFile = await readAuthFile();

  if (!authFile.mal) {
    console.log(`MAL (${config.malBaseUrl}): not logged in`);
    console.log("Codex provider: unknown (run `mal login` first)");
    return;
  }

  console.log(
    `MAL (${config.malBaseUrl}): logged in${
      needsMalTokenRefresh(authFile.mal) ? " (refresh needed)" : ""
    }`,
  );

  const credentials = await listHarnessCredentials();
  const codexCredential = credentials.find((credential) => {
    return credential.providerId === "openai-codex";
  });

  if (!codexCredential) {
    console.log("Codex provider: not configured");
    return;
  }

  console.log(
    `Codex provider: configured (last refreshed ${codexCredential.lastRefresh.toISOString()})`,
  );
}
