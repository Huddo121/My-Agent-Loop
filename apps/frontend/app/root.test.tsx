import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./root";

const {
  useSession,
  useAppSessionQuery,
  useWorkspaceContext,
  useCurrentWorkspace,
} = vi.hoisted(() => ({
  useSession: vi.fn(),
  useAppSessionQuery: vi.fn(),
  useWorkspaceContext: vi.fn(),
  useCurrentWorkspace: vi.fn(),
}));

vi.mock(
  import("react-router"),
  () =>
    ({
      Links: () => null,
      Meta: () => null,
      Outlet: () => <div>app-outlet</div>,
      Scripts: () => null,
      ScrollRestoration: () => null,
      isRouteErrorResponse: () => false,
    }) as unknown as Awaited<typeof import("react-router")>,
);

vi.mock(
  import("./components/auth"),
  () =>
    ({
      AuthGate: () => <div>auth-gate</div>,
    }) as unknown as Awaited<typeof import("./components/auth")>,
);

vi.mock(
  import("./components/workspaces"),
  () =>
    ({
      WorkspaceSetup: () => <div>workspace-setup</div>,
    }) as unknown as Awaited<typeof import("./components/workspaces")>,
);

vi.mock(
  import("./lib/live-events"),
  () =>
    ({
      LiveEventsProvider: ({ children }: { children: React.ReactNode }) =>
        children,
    }) as unknown as Awaited<typeof import("./lib/live-events")>,
);

vi.mock(
  import("./components/ui/sidebar"),
  () =>
    ({
      FloatingSidebarTrigger: () => <div>sidebar-trigger</div>,
      SidebarProvider: ({ children }: { children: React.ReactNode }) =>
        children,
    }) as unknown as Awaited<typeof import("./components/ui/sidebar")>,
);

vi.mock(
  import("./lib/auth"),
  () =>
    ({
      authClient: {
        useSession,
      },
      useAppSessionQuery,
    }) as unknown as Awaited<typeof import("./lib/auth")>,
);

vi.mock(
  import("./lib/workspaces"),
  () =>
    ({
      CurrentWorkspaceProvider: ({
        children,
      }: {
        children: React.ReactNode;
        workspace: unknown;
      }) => children,
      WorkspaceProvider: ({ children }: { children: React.ReactNode }) =>
        children,
      useWorkspaceContext,
      useCurrentWorkspace,
    }) as unknown as Awaited<typeof import("./lib/workspaces")>,
);

describe("App root auth gating", () => {
  beforeEach(() => {
    useAppSessionQuery.mockReset();
    useSession.mockReset();
    useWorkspaceContext.mockReset();
    useCurrentWorkspace.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the auth gate for anonymous users", () => {
    useSession.mockReturnValue({
      data: null,
      isPending: false,
    });
    useAppSessionQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: false,
    });

    render(<App />);

    expect(screen.getByText("auth-gate")).toBeTruthy();
  });

  it("shows the workspace bootstrap step when the session requires it", () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1" } },
      isPending: false,
    });
    useAppSessionQuery.mockReturnValue({
      data: { needsWorkspaceBootstrap: true },
      isLoading: false,
      isPending: false,
    });

    render(<App />);

    expect(screen.getByText("workspace-setup")).toBeTruthy();
  });

  it("renders the app shell when the user is authenticated and bootstrapped", () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1" } },
      isPending: false,
    });
    useAppSessionQuery.mockReturnValue({
      data: { needsWorkspaceBootstrap: false },
      isLoading: false,
      isPending: false,
    });
    useWorkspaceContext.mockReturnValue({
      currentWorkspace: { id: "workspace-1" },
      isLoadingWorkspaces: false,
    });
    useCurrentWorkspace.mockReturnValue({ id: "workspace-1" });

    render(<App />);

    expect(screen.getByText("app-outlet")).toBeTruthy();
    expect(screen.getByText("sidebar-trigger")).toBeTruthy();
  });
});
