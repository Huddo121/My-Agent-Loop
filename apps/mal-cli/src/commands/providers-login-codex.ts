import { getMalAccessToken, uploadCodexTokens } from "../api";
import { openAiCodexOAuthConfig } from "../config";
import { exchangeToken } from "../oauth";
import { runOAuthFlow } from "../oauthFlow";
import { createPkceChallenge } from "../pkce";

const OPENAI_CODEX_LOGIN_PORT = 1455;

export async function providersLoginCodex(): Promise<void> {
  await getMalAccessToken();

  const pkce = createPkceChallenge();

  const authorizeUrl = new URL(openAiCodexOAuthConfig.authorizeUrl);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: openAiCodexOAuthConfig.clientId,
    redirect_uri: openAiCodexOAuthConfig.redirectUri,
    scope: openAiCodexOAuthConfig.scope,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256",
    state: pkce.state,
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "codex_cli_rs",
  }).toString();

  const callback = await runOAuthFlow({
    authorizeUrl: authorizeUrl.toString(),
    expectedState: pkce.state,
    port: OPENAI_CODEX_LOGIN_PORT,
  });

  const tokenResponse = await exchangeToken(
    openAiCodexOAuthConfig.tokenUrl,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: callback.code,
      redirect_uri: openAiCodexOAuthConfig.redirectUri,
      client_id: openAiCodexOAuthConfig.clientId,
      code_verifier: pkce.codeVerifier,
    }),
  );

  if (!tokenResponse.refresh_token || !tokenResponse.id_token) {
    throw new Error(
      "OpenAI token response did not include all required tokens.",
    );
  }

  await uploadCodexTokens({
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    id_token: tokenResponse.id_token,
  });

  console.log("Codex provider credentials saved to My Agent Loop.");
}
