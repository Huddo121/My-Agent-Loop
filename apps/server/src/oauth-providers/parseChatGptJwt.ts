import z from "zod";

import type { Result } from "../utils/Result";

const chatGptJwtPayloadSchema = z.object({
  "https://api.openai.com/auth": z.object({
    chatgpt_account_id: z.string().min(1),
  }),
});

export type ParseChatGptJwtError =
  | { reason: "malformed-jwt"; issues: string[] }
  | { reason: "invalid-payload"; issues: string[] };

export function parseChatGptJwt(
  jwt: string,
): Result<string, ParseChatGptJwtError> {
  const parts = jwt.split(".");
  if (parts.length !== 3 || parts[1] === undefined || parts[1] === "") {
    return {
      success: false,
      error: {
        reason: "malformed-jwt",
        issues: ["Expected a JWT with three dot-separated parts."],
      },
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch (cause) {
    return {
      success: false,
      error: {
        reason: "malformed-jwt",
        issues: [
          cause instanceof Error
            ? cause.message
            : "JWT payload could not be decoded.",
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
