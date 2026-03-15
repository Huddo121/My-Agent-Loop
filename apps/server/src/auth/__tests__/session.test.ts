import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthSession, requireAuthSession } from "../session";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("../auth", () => ({
  auth: {
    api: {
      getSession,
    },
  },
}));

describe("auth session helpers", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("returns null when Better Auth has no current session", async () => {
    getSession.mockResolvedValue(null);

    await expect(
      getAuthSession(new Request("http://localhost")),
    ).resolves.toBeNull();
    await expect(
      requireAuthSession(new Request("http://localhost")),
    ).resolves.toBeNull();
  });

  it("maps Better Auth session data into the app auth shape", async () => {
    getSession.mockResolvedValueOnce({
      session: {
        id: "session-1",
        token: "token-1",
        userId: "user-1",
        expiresAt: new Date("2026-03-15T00:00:00.000Z"),
        createdAt: new Date("2026-03-15T00:00:00.000Z"),
        updatedAt: new Date("2026-03-15T00:00:00.000Z"),
      },
      user: {
        id: "user-1",
        email: "user@example.com",
        emailVerified: true,
        name: "User One",
        image: null,
        createdAt: new Date("2026-03-15T00:00:00.000Z"),
        updatedAt: new Date("2026-03-15T00:00:00.000Z"),
      },
    });

    await expect(
      getAuthSession(new Request("http://localhost")),
    ).resolves.toMatchObject({
      session: { userId: "user-1" },
      user: { id: "user-1", email: "user@example.com" },
    });
  });
});
