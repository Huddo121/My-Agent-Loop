import { describe, expect, it } from "vitest";
import { buildHttpsRepositoryUrl, getForgeProjectPath } from "../forge";
import { ProtectedString } from "../utils/ProtectedString";
import { buildAuthenticatedUrl } from "./GitService";

describe("buildAuthenticatedUrl", () => {
  const token = new ProtectedString("token with / special characters");

  it.each([
    {
      forgeType: "github" as const,
      forgeBaseUrl: "https://github.com",
      repositoryUrl: "https://github.com/owner/repo.git",
      expected:
        "https://x-access-token:token%20with%20%2F%20special%20characters@github.com/owner/repo.git",
    },
    {
      forgeType: "github" as const,
      forgeBaseUrl: "https://github.com",
      repositoryUrl: "git@github.com:owner/repo.git",
      expected:
        "https://x-access-token:token%20with%20%2F%20special%20characters@github.com/owner/repo.git",
    },
    {
      forgeType: "gitlab" as const,
      forgeBaseUrl: "https://gitlab.example.com",
      repositoryUrl: "ssh://git@gitlab.example.com:2222/group/repo.git",
      expected:
        "https://oauth2:token%20with%20%2F%20special%20characters@gitlab.example.com/group/repo.git",
    },
  ])("builds an authenticated HTTPS URL from $repositoryUrl", ({
    forgeType,
    forgeBaseUrl,
    repositoryUrl,
    expected,
  }) => {
    expect(
      buildAuthenticatedUrl(
        repositoryUrl,
        forgeBaseUrl,
        forgeType,
        token,
      ).getSecretValue(),
    ).toBe(expected);
  });

  it("uses the configured forge host rather than the SSH clone host", () => {
    expect(
      buildAuthenticatedUrl(
        "git@ssh.gitlab.example.com:group/repo.git",
        "https://gitlab.example.com",
        "gitlab",
        token,
      ).getSecretValue(),
    ).toBe(
      "https://oauth2:token%20with%20%2F%20special%20characters@gitlab.example.com/group/repo.git",
    );
  });
});

describe("buildHttpsRepositoryUrl", () => {
  it("uses the forge web host and preserves a self-hosted base path", () => {
    expect(
      buildHttpsRepositoryUrl(
        "https://forge.example.com/gitlab/",
        "git@ssh.example.com:group/repo.git",
      ),
    ).toBe("https://forge.example.com/gitlab/group/repo.git");
  });

  it("does not duplicate a self-hosted base path from an HTTPS clone URL", () => {
    expect(
      buildHttpsRepositoryUrl(
        "https://forge.example.com/gitlab/",
        "https://forge.example.com/gitlab/group/repo.git",
      ),
    ).toBe("https://forge.example.com/gitlab/group/repo.git");
  });

  it("rejects a non-HTTPS forge host", () => {
    expect(() =>
      buildHttpsRepositoryUrl(
        "http://forge.example.com",
        "https://forge.example.com/group/repo.git",
      ),
    ).toThrow("Forge hosting URL must use HTTPS");
  });
});

describe("getForgeProjectPath", () => {
  it("strips a self-hosted base path for forge API calls", () => {
    expect(
      getForgeProjectPath(
        "https://forge.example.com/gitlab/",
        "https://forge.example.com/gitlab/group/repo.git",
      ),
    ).toBe("group/repo");
  });
});
