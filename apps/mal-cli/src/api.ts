import { z } from "zod";
import { getConfig, getMalOAuthResource } from "./config";
import { needsMalTokenRefresh, refreshMalToken } from "./oauth";
import { readAuthFile, writeAuthFile } from "./storage";

const credentialSummarySchema = z.object({
  providerId: z.literal("openai-codex"),
  lastRefresh: z.coerce.date(),
});

const credentialListSchema = z.union([
  z.array(credentialSummarySchema),
  z
    .object({ credentials: z.array(credentialSummarySchema) })
    .transform((body) => {
      return body.credentials;
    }),
]);

export type CredentialSummary = z.infer<typeof credentialSummarySchema>;

export async function getMalAccessToken(): Promise<string> {
  const authFile = await readAuthFile();
  if (!authFile.mal) {
    throw new Error("Run `mal-cli login` first.");
  }

  const config = getConfig();
  if (!needsMalTokenRefresh(authFile.mal)) {
    return authFile.mal.accessToken;
  }

  try {
    const refreshed = await refreshMalToken(
      `${config.malAuthBaseUrl}/oauth2/token`,
      authFile.mal,
      getMalOAuthResource(config),
    );
    await writeAuthFile({ ...authFile, mal: refreshed });
    return refreshed.accessToken;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `MAL login expired. Run \`mal-cli login\` again. ${message}`,
    );
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  return JSON.parse(text);
}

function responseErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "error_description" in body &&
    typeof body.error_description === "string"
  ) {
    return body.error_description;
  }

  return typeof body === "string" ? body : JSON.stringify(body);
}

export async function listHarnessCredentials(): Promise<CredentialSummary[]> {
  const config = getConfig();
  const accessToken = await getMalAccessToken();
  const response = await fetch(
    `${config.malApiBaseUrl}/me/harness-credentials`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(
      `Failed to load provider status: ${responseErrorMessage(body)}`,
    );
  }

  return credentialListSchema.parse(body);
}

export async function uploadCodexTokens(tokens: {
  access_token: string;
  refresh_token: string;
  id_token: string;
}): Promise<CredentialSummary> {
  const config = getConfig();
  const accessToken = await getMalAccessToken();
  const response = await fetch(
    `${config.malApiBaseUrl}/me/harness-credentials/openai-codex`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tokens }),
    },
  );
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(
      `Failed to upload Codex credentials: ${responseErrorMessage(body)}`,
    );
  }

  return credentialSummarySchema.parse(body);
}

export async function deleteCodexTokens(): Promise<void> {
  const config = getConfig();
  const accessToken = await getMalAccessToken();
  const response = await fetch(
    `${config.malApiBaseUrl}/me/harness-credentials/openai-codex`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const body = await parseResponseBody(response);
    throw new Error(
      `Failed to remove Codex credentials: ${responseErrorMessage(body)}`,
    );
  }
}
