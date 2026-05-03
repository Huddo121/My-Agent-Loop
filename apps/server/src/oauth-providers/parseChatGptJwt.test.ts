import { describe, expect, it } from "vitest";

import { parseChatGptJwt } from "./parseChatGptJwt";

function encodeJwtPayload(payload: unknown): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "",
  ].join(".");
}

describe("parseChatGptJwt", () => {
  it("returns the ChatGPT account ID claim", () => {
    const result = parseChatGptJwt(
      encodeJwtPayload({
        "https://api.openai.com/auth": {
          chatgpt_account_id: "account-123",
        },
      }),
    );

    expect(result).toEqual({ success: true, value: "account-123" });
  });

  it("returns an explicit failure for malformed JWTs", () => {
    const result = parseChatGptJwt("not-a-jwt");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.reason).toBe("malformed-jwt");
    }
  });

  it("returns an explicit failure when the account ID claim is missing", () => {
    const result = parseChatGptJwt(encodeJwtPayload({ sub: "user-123" }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.reason).toBe("invalid-payload");
    }
  });
});
