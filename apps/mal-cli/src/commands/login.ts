import { getConfig, malOAuthConfig } from "../config";
import { exchangeToken, tokenResponseToStoredToken } from "../oauth";
import { runOAuthFlow } from "../oauthFlow";
import { createPkceChallenge } from "../pkce";
import { readAuthFile, writeAuthFile } from "../storage";

const MAL_LOGIN_PORT = 53682;

export async function login(): Promise<void> {
  const config = getConfig();
  const pkce = createPkceChallenge();

  const authorizeUrl = new URL(`${config.malAuthBaseUrl}/oauth2/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: malOAuthConfig.clientId,
    redirect_uri: malOAuthConfig.redirectUri,
    scope: malOAuthConfig.scope,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256",
    state: pkce.state,
  }).toString();

  const callback = await runOAuthFlow({
    authorizeUrl: authorizeUrl.toString(),
    expectedState: pkce.state,
    port: MAL_LOGIN_PORT,
  });

  const tokenResponse = await exchangeToken(
    `${config.malAuthBaseUrl}/oauth2/token`,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: callback.code,
      redirect_uri: malOAuthConfig.redirectUri,
      client_id: malOAuthConfig.clientId,
      code_verifier: pkce.codeVerifier,
    }),
  );

  const authFile = await readAuthFile();
  await writeAuthFile({
    ...authFile,
    mal: tokenResponseToStoredToken(tokenResponse),
  });

  console.log(`Logged in to My Agent Loop at ${config.malBaseUrl}.`);
}
