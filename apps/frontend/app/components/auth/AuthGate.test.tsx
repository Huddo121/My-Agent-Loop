import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";

const { mutate } = vi.hoisted(() => ({
  mutate: vi.fn(),
}));

vi.mock(import("~/lib/auth"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMagicLinkSignIn: () => ({
      mutate,
      isPending: false,
      isError: false,
    }),
  } as unknown as Awaited<typeof import("~/lib/auth")>;
});

describe("AuthGate", () => {
  beforeEach(() => {
    mutate.mockReset();
    window.history.replaceState({}, "", "/");
  });

  it("submits a normalized email with the current relative callback URL", () => {
    window.history.replaceState(
      {},
      "",
      "/projects/project-123?tab=tasks#details",
    );

    render(
      <MemoryRouter
        initialEntries={["/projects/project-123?tab=tasks#details"]}
      >
        <AuthGate />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: " USER@Example.COM " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      {
        email: "user@example.com",
        callbackURL: "/projects/project-123?tab=tasks#details",
      },
      expect.any(Object),
    );
  });

  it("uses ?redirectTo as the magic-link callbackURL when it is a same-origin path", () => {
    render(
      <MemoryRouter
        initialEntries={["/?redirectTo=%2Foauth%2Fconsent%3Ffoo%3Dbar"]}
      >
        <AuthGate />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      {
        email: "user@example.com",
        callbackURL: "/oauth/consent?foo=bar",
      },
      expect.any(Object),
    );
  });

  it("rejects a cross-origin redirectTo and falls back to the default callback URL", () => {
    window.history.replaceState({}, "", "/");

    render(
      <MemoryRouter
        initialEntries={["/?redirectTo=https%3A%2F%2Fevil.example.com%2Fx"]}
      >
        <AuthGate />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const callArgs = mutate.mock.calls[0]?.[0] as { callbackURL: string };
    expect(callArgs.callbackURL).not.toContain("evil.example.com");
    expect(callArgs.callbackURL.startsWith("/")).toBe(true);
    expect(callArgs.callbackURL.startsWith("//")).toBe(false);
  });

  it("rejects a protocol-relative redirectTo and falls back to the default callback URL", () => {
    window.history.replaceState({}, "", "/");

    render(
      <MemoryRouter
        initialEntries={["/?redirectTo=%2F%2Fevil.example.com%2Fx"]}
      >
        <AuthGate />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const callArgs = mutate.mock.calls[0]?.[0] as { callbackURL: string };
    expect(callArgs.callbackURL.startsWith("//")).toBe(false);
  });
});
