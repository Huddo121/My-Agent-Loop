import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "../auth/UserId";
import { FakeDatabase } from "../test-fakes";
import type {
  UserOAuthCredentialRepository,
  UserOAuthCredentialSummary,
} from "../user-oauth-credentials";
import { meHandlers } from "./me-handlers";

const { requireOAuthBearer } = vi.hoisted(() => ({
  requireOAuthBearer: vi.fn(),
}));

const { parseChatGptJwt } = vi.hoisted(() => ({
  parseChatGptJwt: vi.fn(),
}));

vi.mock(import("../auth/oauth-bearer"), () => ({
  requireOAuthBearer,
}));

vi.mock(import("../oauth-providers"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseChatGptJwt,
  };
});

type HarnessCredentialsHandlers = (typeof meHandlers)["harness-credentials"];
type HarnessCredentialsGetContext = Parameters<
  HarnessCredentialsHandlers["GET"]
>[0];
type HarnessCredentialsProviderHandlers =
  HarnessCredentialsHandlers[":providerId"];
type HarnessCredentialsProviderPutContext = Parameters<
  HarnessCredentialsProviderHandlers["PUT"]
>[0];
type HarnessCredentialsProviderDeleteContext = Parameters<
  HarnessCredentialsProviderHandlers["DELETE"]
>[0];

class FakeUserOAuthCredentialRepository
  implements UserOAuthCredentialRepository
{
  summaries: UserOAuthCredentialSummary[] = [];
  upsertCredentialCalls: Array<{
    userId: UserId;
    providerId: string;
    plainTokens: string;
    lastRefresh: Date;
  }> = [];
  deleteCredentialCalls: Array<{ userId: UserId; providerId: string }> = [];

  async getCredential() {
    return undefined;
  }

  async hasCredential() {
    return false;
  }

  async upsertCredential(
    userId: UserId,
    providerId: string,
    plainTokens: string,
    lastRefresh: Date,
  ) {
    this.upsertCredentialCalls.push({
      userId,
      providerId,
      plainTokens,
      lastRefresh,
    });
  }

  async deleteCredential(userId: UserId, providerId: string) {
    this.deleteCredentialCalls.push({ userId, providerId });
  }

  async listCredentials() {
    return this.summaries;
  }
}

function encodeJwtPayload(payload: unknown): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "",
  ].join(".");
}

function createCtx(overrides?: {
  providerId?: string;
  body?: unknown;
  repository?: FakeUserOAuthCredentialRepository;
}) {
  const db = new FakeDatabase();
  const userOAuthCredentialRepository =
    overrides?.repository ?? new FakeUserOAuthCredentialRepository();

  const ctx = {
    hono: {
      req: {
        raw: new Request("http://localhost/api/me/harness-credentials"),
        param: () => ({
          providerId: overrides?.providerId ?? "openai-codex",
        }),
      },
    },
    body:
      overrides?.body ??
      ({
        tokens: {
          access_token: encodeJwtPayload({
            "https://api.openai.com/auth": {
              chatgpt_account_id: "account-123",
            },
          }),
          refresh_token: "refresh-token",
          id_token: "id-token",
        },
      } satisfies unknown),
    services: {
      db: db.asDatabase(),
      userOAuthCredentialRepository,
    },
  };

  return ctx;
}

describe("me handlers", () => {
  beforeEach(() => {
    requireOAuthBearer.mockReset();
    parseChatGptJwt.mockReset();
    parseChatGptJwt.mockResolvedValue({
      success: true,
      value: "account-123",
    });
  });

  it("returns 401 when harness credentials are requested without an OAuth bearer", async () => {
    requireOAuthBearer.mockResolvedValueOnce(null);

    const response = await meHandlers["harness-credentials"].GET(
      createCtx() as unknown as HarnessCredentialsGetContext,
    );

    expect(response[0]).toBe(401);
  });

  it("lists supported harness credential summaries for the bearer user", async () => {
    requireOAuthBearer.mockResolvedValueOnce("user-1" as UserId);
    const repository = new FakeUserOAuthCredentialRepository();
    repository.summaries = [
      {
        providerId: "openai-codex",
        lastRefresh: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        providerId: "unsupported-provider",
        lastRefresh: new Date("2026-05-02T00:00:00.000Z"),
      },
    ];

    const response = await meHandlers["harness-credentials"].GET(
      createCtx({ repository }) as unknown as HarnessCredentialsGetContext,
    );

    expect(response).toEqual([
      200,
      [
        {
          providerId: "openai-codex",
          lastRefresh: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    ]);
  });

  it("stores provider-validated token bundles with the parsed account ID", async () => {
    requireOAuthBearer.mockResolvedValueOnce("user-1" as UserId);
    const repository = new FakeUserOAuthCredentialRepository();

    const response = await meHandlers["harness-credentials"][":providerId"].PUT(
      createCtx({
        repository,
      }) as unknown as HarnessCredentialsProviderPutContext,
    );

    expect(response[0]).toBe(200);
    expect(response[1]).toMatchObject({ providerId: "openai-codex" });
    expect(repository.upsertCredentialCalls).toHaveLength(1);
    expect(repository.upsertCredentialCalls[0]).toMatchObject({
      userId: "user-1",
      providerId: "openai-codex",
    });
    expect(JSON.parse(repository.upsertCredentialCalls[0].plainTokens)).toEqual(
      {
        access_token: expect.any(String),
        refresh_token: "refresh-token",
        id_token: "id-token",
        account_id: "account-123",
      },
    );
  });

  it("returns 400 for unsupported harness credential providers", async () => {
    requireOAuthBearer.mockResolvedValueOnce("user-1" as UserId);
    const repository = new FakeUserOAuthCredentialRepository();

    const response = await meHandlers["harness-credentials"][":providerId"].PUT(
      createCtx({
        providerId: "another-provider",
        repository,
      }) as unknown as HarnessCredentialsProviderPutContext,
    );

    expect(response[0]).toBe(400);
    expect(repository.upsertCredentialCalls).toEqual([]);
  });

  it("returns 400 when the access token cannot provide an account ID", async () => {
    requireOAuthBearer.mockResolvedValueOnce("user-1" as UserId);
    parseChatGptJwt.mockResolvedValueOnce({
      success: false,
      error: {
        reason: "invalid-jwt",
        issues: ["Access token could not be verified."],
      },
    });
    const repository = new FakeUserOAuthCredentialRepository();

    const response = await meHandlers["harness-credentials"][":providerId"].PUT(
      createCtx({
        repository,
        body: {
          tokens: {
            access_token: "not-a-jwt",
            refresh_token: "refresh-token",
            id_token: "id-token",
          },
        },
      }) as unknown as HarnessCredentialsProviderPutContext,
    );

    expect(response[0]).toBe(400);
    expect(repository.upsertCredentialCalls).toEqual([]);
  });

  it("deletes the requested provider credentials for the bearer user", async () => {
    requireOAuthBearer.mockResolvedValueOnce("user-1" as UserId);
    const repository = new FakeUserOAuthCredentialRepository();

    const response = await meHandlers["harness-credentials"][
      ":providerId"
    ].DELETE(
      createCtx({
        repository,
      }) as unknown as HarnessCredentialsProviderDeleteContext,
    );

    expect(response).toEqual([204, undefined]);
    expect(repository.deleteCredentialCalls).toEqual([
      { userId: "user-1", providerId: "openai-codex" },
    ]);
  });
});
