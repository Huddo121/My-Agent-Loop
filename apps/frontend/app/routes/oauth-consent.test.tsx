import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthConsentScreen } from "./oauth-consent";

const { consent } = vi.hoisted(() => ({
  consent: vi.fn(),
}));

vi.mock(import("~/lib/auth"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    authClient: {
      oauth2: {
        consent,
      },
    },
  } as unknown as Awaited<typeof import("~/lib/auth")>;
});

const SAMPLE_SEARCH =
  "?client_id=mal-cli&scope=openid%20profile%20email%20offline_access&state=abc&redirect_uri=http%3A%2F%2Flocalhost%3A53682%2Fauth%2Fcallback";
const SAMPLE_PATH_WITH_SEARCH = `/oauth/consent${SAMPLE_SEARCH}`;

beforeEach(() => {
  consent.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...window.location,
      assign: vi.fn(),
    },
  });
});

describe("OAuthConsentScreen — unauthenticated", () => {
  it("redirects to the AuthGate sign-in page with the consent URL encoded as redirectTo", async () => {
    function LocationProbe() {
      const location = useLocation();
      return (
        <div data-testid="location">{`${location.pathname}${location.search}`}</div>
      );
    }

    render(
      <MemoryRouter initialEntries={[SAMPLE_PATH_WITH_SEARCH]}>
        <Routes>
          <Route
            path="/oauth/consent"
            element={
              <OAuthConsentScreen
                isAuthenticated={false}
                search={SAMPLE_SEARCH}
                pathWithSearch={SAMPLE_PATH_WITH_SEARCH}
              />
            }
          />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const probe = await screen.findByTestId("location");
    expect(probe.textContent).toBe(
      `/?redirectTo=${encodeURIComponent(SAMPLE_PATH_WITH_SEARCH)}`,
    );
    expect(consent).not.toHaveBeenCalled();
  });
});

describe("OAuthConsentScreen — authenticated", () => {
  it("renders the requested client_id and scopes from query parameters", () => {
    render(
      <OAuthConsentScreen
        isAuthenticated={true}
        search={SAMPLE_SEARCH}
        pathWithSearch={SAMPLE_PATH_WITH_SEARCH}
      />,
    );

    expect(screen.getByText("mal-cli")).toBeTruthy();
    const scopesList = screen.getByTestId("oauth-consent-scopes");
    expect(scopesList.textContent).toContain("openid");
    expect(scopesList.textContent).toContain("profile");
    expect(scopesList.textContent).toContain("email");
    expect(scopesList.textContent).toContain("offline_access");
  });

  it("calls the oauth-provider consent client with accept=true when the user clicks Allow", async () => {
    consent.mockResolvedValueOnce({
      data: { redirect_uri: "http://localhost:53682/auth/callback?code=abc" },
    });

    render(
      <OAuthConsentScreen
        isAuthenticated={true}
        search={SAMPLE_SEARCH}
        pathWithSearch={SAMPLE_PATH_WITH_SEARCH}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(consent).toHaveBeenCalledWith({ accept: true });
    });
    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith(
        "http://localhost:53682/auth/callback?code=abc",
      );
    });
  });

  it("calls the oauth-provider consent client with accept=false when the user clicks Cancel", async () => {
    consent.mockResolvedValueOnce({
      data: {
        redirect_uri:
          "http://localhost:53682/auth/callback?error=access_denied",
      },
    });

    render(
      <OAuthConsentScreen
        isAuthenticated={true}
        search={SAMPLE_SEARCH}
        pathWithSearch={SAMPLE_PATH_WITH_SEARCH}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(consent).toHaveBeenCalledWith({ accept: false });
    });
    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith(
        "http://localhost:53682/auth/callback?error=access_denied",
      );
    });
  });

  it("surfaces a consent API error to the user", async () => {
    consent.mockResolvedValueOnce({
      error: { message: "boom" },
    });

    render(
      <OAuthConsentScreen
        isAuthenticated={true}
        search={SAMPLE_SEARCH}
        pathWithSearch={SAMPLE_PATH_WITH_SEARCH}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("boom");
    });
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("renders an invalid-request screen when client_id is missing from the URL", () => {
    render(
      <OAuthConsentScreen
        isAuthenticated={true}
        search="?scope=openid"
        pathWithSearch="/oauth/consent?scope=openid"
      />,
    );

    expect(screen.getByText("Invalid consent request")).toBeTruthy();
  });
});
