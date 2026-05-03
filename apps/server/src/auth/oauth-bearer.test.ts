import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyAccessToken } = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("@better-auth/oauth-provider/resource-client", () => ({
  oauthProviderResourceClient: vi.fn(() => ({
    id: "oauth-provider-resource-client",
    getActions: () => ({
      verifyAccessToken,
    }),
  })),
}));

import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import {
  MAL_OAUTH_ACCESS_TOKEN_SCOPES,
  requireOAuthBearer,
} from "./oauth-bearer";

describe("requireOAuthBearer", () => {
  beforeEach(() => {
    verifyAccessToken.mockReset();
    vi.mocked(oauthProviderResourceClient).mockClear();
  });

  it("returns null when Authorization is absent", async () => {
    await expect(
      requireOAuthBearer(new Request("http://localhost/")),
    ).resolves.toBeNull();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns null for non-Bearer schemes", async () => {
    await expect(
      requireOAuthBearer(
        new Request("http://localhost/", {
          headers: { Authorization: "Basic dGVzdA==" },
        }),
      ),
    ).resolves.toBeNull();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("returns null when Bearer token is empty", async () => {
    await expect(
      requireOAuthBearer(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer" },
        }),
      ),
    ).resolves.toBeNull();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("calls verifyAccessToken with issuer, audience, and required scopes", async () => {
    verifyAccessToken.mockResolvedValueOnce({ sub: "user-abc" });

    await expect(
      requireOAuthBearer(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer  jwt-token" },
        }),
      ),
    ).resolves.toBe("user-abc");

    expect(verifyAccessToken).toHaveBeenCalledTimes(1);
    expect(verifyAccessToken).toHaveBeenCalledWith(
      "jwt-token",
      expect.objectContaining({
        verifyOptions: {
          issuer: "http://localhost:5173",
          audience: "http://localhost:5173",
        },
        scopes: [...MAL_OAUTH_ACCESS_TOKEN_SCOPES],
        jwksUrl: "http://localhost:5173/api/auth/jwks",
      }),
    );
  });

  it("returns null when verification fails (e.g. wrong aud/iss/expired/scopes)", async () => {
    verifyAccessToken.mockRejectedValueOnce(new Error("token invalid"));

    await expect(
      requireOAuthBearer(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer bad" },
        }),
      ),
    ).resolves.toBeNull();
  });

  it("returns null when payload has no sub", async () => {
    verifyAccessToken.mockResolvedValueOnce({});

    await expect(
      requireOAuthBearer(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer x" },
        }),
      ),
    ).resolves.toBeNull();
  });

  it("returns null when sub is empty", async () => {
    verifyAccessToken.mockResolvedValueOnce({ sub: "" });

    await expect(
      requireOAuthBearer(
        new Request("http://localhost/", {
          headers: { Authorization: "Bearer x" },
        }),
      ),
    ).resolves.toBeNull();
  });
});
