const DEFAULT_MAL_BASE_URL = "http://localhost:5173";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export type CliConfig = {
  malBaseUrl: string;
  malAuthBaseUrl: string;
  malApiBaseUrl: string;
};

export function getConfig(): CliConfig {
  const malBaseUrl = trimTrailingSlash(
    process.env.MAL_BASE_URL?.trim() || DEFAULT_MAL_BASE_URL,
  );

  return {
    malBaseUrl,
    malAuthBaseUrl: `${malBaseUrl}/api/auth`,
    malApiBaseUrl: `${malBaseUrl}/api`,
  };
}

export const malOAuthConfig = {
  clientId: "mal-cli",
  redirectUri: "http://localhost:53682/auth/callback",
  scope: "openid profile email offline_access",
} as const;

export const openAiCodexOAuthConfig = {
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  redirectUri: "http://localhost:1455/auth/callback",
  scope: "openid profile email offline_access",
} as const;
