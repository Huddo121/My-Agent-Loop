import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  jwtVerify,
  SignJWT,
} from "jose";
import { describe, expect, it } from "vitest";

import {
  type ChatGptJwtVerifier,
  OPENAI_AUTH_ISSUER,
  OPENAI_CHATGPT_AUDIENCE,
  parseChatGptJwt,
} from "./parseChatGptJwt";

async function createVerifierAndJwt(payload: Record<string, unknown>) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  const jwks = createLocalJWKSet({ keys: [publicJwk] });
  const verifyJwt: ChatGptJwtVerifier = async (jwt: string) => {
    const verified = await jwtVerify(jwt, jwks, {
      issuer: OPENAI_AUTH_ISSUER,
      audience: OPENAI_CHATGPT_AUDIENCE,
    });
    return verified.payload;
  };
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(OPENAI_AUTH_ISSUER)
    .setAudience(OPENAI_CHATGPT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  return { jwt, verifyJwt };
}

describe("parseChatGptJwt", () => {
  it("verifies the JWT and returns the ChatGPT account ID claim", async () => {
    const { jwt, verifyJwt } = await createVerifierAndJwt({
      "https://api.openai.com/auth": {
        chatgpt_account_id: "account-123",
      },
    });

    const result = await parseChatGptJwt(jwt, verifyJwt);

    expect(result).toEqual({ success: true, value: "account-123" });
  });

  it("returns an explicit failure for unverifiable JWTs", async () => {
    const result = await parseChatGptJwt("not-a-jwt", async () => {
      throw new Error("JWT signature or claims could not be verified.");
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.reason).toBe("invalid-jwt");
    }
  });

  it("returns an explicit failure when the account ID claim is missing", async () => {
    const { jwt, verifyJwt } = await createVerifierAndJwt({ sub: "user-123" });

    const result = await parseChatGptJwt(jwt, verifyJwt);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.reason).toBe("invalid-payload");
    }
  });
});
