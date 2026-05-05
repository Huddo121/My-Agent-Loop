import { describe, expect, it } from "vitest";

import { OpenAiCodexProvider } from "./OpenAiCodexProvider";
import type { StoredOAuthTokens } from "./types";

describe("OpenAiCodexProvider", () => {
  it("materializes Codex auth.json for the sandbox", () => {
    const provider = new OpenAiCodexProvider(
      () => new Date("2026-05-04T01:02:03.456Z"),
    );
    const tokens: StoredOAuthTokens = {
      access_token: "access-token",
      id_token: "id-token",
      refresh_token: "refresh-token",
      account_id: "account-id",
    };

    const artifacts = provider.materializeForSandbox(tokens);

    expect(artifacts.env).toEqual({});
    expect(artifacts.files).toHaveLength(1);
    expect(artifacts.files[0]).toEqual({
      containerPath: "/root/.codex/auth.json",
      contents: JSON.stringify(
        {
          OPENAI_API_KEY: null,
          tokens: {
            access_token: "access-token",
            id_token: "id-token",
            refresh_token: "refresh-token",
            account_id: "account-id",
          },
          last_refresh: "2026-05-04T01:02:03.456Z",
        },
        null,
        2,
      ),
    });
  });
});
