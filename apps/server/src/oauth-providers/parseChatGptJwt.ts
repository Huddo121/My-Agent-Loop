import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import z from "zod";

import type { Result } from "../utils/Result";

// OpenAI issues ChatGPT/Codex tokens from its own auth service (auth.openai.com), not the
// legacy Auth0 tenant. The issuer claim is the bare origin with no trailing slash and the
// audience is the v1 API, matching what the Codex CLI itself receives — verified against a
// real token. The chatgpt_account_id still lives under the /auth namespaced claim below.
export const OPENAI_AUTH_ISSUER = "https://auth.openai.com";
export const OPENAI_CHATGPT_AUDIENCE = "https://api.openai.com/v1";
const OPENAI_AUTH_JWKS_URL = "https://auth.openai.com/.well-known/jwks.json";

const chatGptJwtPayloadSchema = z.object({
  "https://api.openai.com/auth": z.object({
    chatgpt_account_id: z.string().min(1),
  }),
});

export type ParseChatGptJwtError =
  | { reason: "invalid-jwt"; issues: string[] }
  | { reason: "invalid-payload"; issues: string[] };

export type ChatGptJwtVerifier = (jwt: string) => Promise<JWTPayload>;

const openAiAuthJwks = createRemoteJWKSet(new URL(OPENAI_AUTH_JWKS_URL));

const verifyOpenAiChatGptJwt: ChatGptJwtVerifier = async (jwt) => {
  const { payload } = await jwtVerify(jwt, openAiAuthJwks, {
    issuer: OPENAI_AUTH_ISSUER,
    audience: OPENAI_CHATGPT_AUDIENCE,
  });
  return payload;
};

export async function parseChatGptJwt(
  jwt: string,
  verifyJwt: ChatGptJwtVerifier = verifyOpenAiChatGptJwt,
): Promise<Result<string, ParseChatGptJwtError>> {
  let payload: JWTPayload;
  try {
    payload = await verifyJwt(jwt);
  } catch (cause) {
    return {
      success: false,
      error: {
        reason: "invalid-jwt",
        issues: [
          cause instanceof Error
            ? cause.message
            : "JWT signature or claims could not be verified.",
        ],
      },
    };
  }

  const parsed = chatGptJwtPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        reason: "invalid-payload",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
    };
  }

  return {
    success: true,
    value: parsed.data["https://api.openai.com/auth"].chatgpt_account_id,
  };
}
