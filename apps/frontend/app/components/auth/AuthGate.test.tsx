import { fireEvent, render, screen } from "@testing-library/react";
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

    render(<AuthGate />);

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
});
