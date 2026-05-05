import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import z from "zod";

import type { Result } from "../utils/Result";

export const OPENAI_AUTH_ISSUER = "https://auth0.openai.com/";
export const OPENAI_CHATGPT_AUDIENCE = "https://api.openai.com/auth";
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
