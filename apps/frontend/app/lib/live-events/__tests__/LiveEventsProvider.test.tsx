import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveEventsProvider } from "../LiveEventsProvider";

const { mockSessionGet } = vi.hoisted(() => {
  const mockSessionGet = vi.fn();
  return { mockSessionGet };
});
const { useParams } = vi.hoisted(() => ({
  useParams: vi.fn(),
}));
const { useCurrentWorkspace } = vi.hoisted(() => ({
  useCurrentWorkspace: vi.fn(),
}));

const listeners: Record<string, ((ev: MessageEvent) => void)[]> = {};

let eventSourceInstance: {
  url: string;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener: (type: string, handler: (ev: MessageEvent) => void) => void;
  removeEventListener: (
    type: string,
    handler: (ev: MessageEvent) => void,
  ) => void;
  dispatchEvent: (type: string, data: string) => void;
  close: () => void;
} | null = null;

vi.mock("react-router", () => ({
  useParams,
}));

vi.mock("~/lib/workspaces", () => ({
  useCurrentWorkspace,
}));

vi.mock("~/lib/api-client", () => ({
  apiClient: {
    session: { GET: mockSessionGet },
  },
}));

vi.stubGlobal(
  "EventSource",
  class MockEventSource {
    url: string;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(url: string) {
      this.url = url;
      eventSourceInstance = this;
    }

    addEventListener(type: string, handler: (ev: MessageEvent) => void) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    }

    removeEventListener(type: string, handler: (ev: MessageEvent) => void) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((h) => h !== handler);
    }

    dispatchEvent(type: string, data: string) {
      for (const h of listeners[type] ?? []) {
        h(new MessageEvent(type, { data }));
      }
    }

    close() {
      eventSourceInstance = null;
      for (const k of Object.keys(listeners)) {
        delete listeners[k];
      }
    }
  },
);

describe("LiveEventsProvider", () => {
  let queryClient: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.fn>;
  let setQueryDataSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");
    useCurrentWorkspace.mockReturnValue({ id: "ws-1" });
    useParams.mockReturnValue({});
    mockSessionGet.mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    if (eventSourceInstance) {
      eventSourceInstance.close();
    }
  });

  it("invalidates projects and tasks queries on stream open", async () => {
    useParams.mockReturnValue({ projectId: "proj-1" });
    render(
      <QueryClientProvider client={queryClient}>
        <LiveEventsProvider>
          <div>children</div>
        </LiveEventsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(eventSourceInstance).toBeTruthy();
    });

    expect(eventSourceInstance?.url).toContain("workspace-projects");
    expect(eventSourceInstance?.url).toContain("project-board");
    expect(eventSourceInstance?.url).toContain("proj-1");

    eventSourceInstance?.onopen?.();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["projects", "ws-1"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["tasks", "proj-1"],
      });
    });
  });

  it("closes EventSource and stops reconnecting when session returns 401", async () => {
    useParams.mockReturnValue({ projectId: "proj-1" });
    mockSessionGet.mockResolvedValue({ status: 401 });

    render(
      <QueryClientProvider client={queryClient}>
        <LiveEventsProvider>
          <div>children</div>
        </LiveEventsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(eventSourceInstance).toBeTruthy();
    });

    const instance = eventSourceInstance;
    expect(instance).toBeTruthy();
    if (instance) {
      const closeSpy = vi.spyOn(instance, "close");
      instance.onerror?.();
      await waitFor(() => {
        expect(mockSessionGet).toHaveBeenCalled();
        expect(closeSpy).toHaveBeenCalled();
      });
    }
  });

  it("updates cache when project.updated event is received", async () => {
    useParams.mockReturnValue({ projectId: "proj-1" });
    render(
      <QueryClientProvider client={queryClient}>
        <LiveEventsProvider>
          <div>children</div>
        </LiveEventsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(eventSourceInstance).toBeTruthy();
    });

    const projectPayload = {
      type: "project.updated",
      project: {
        id: "proj-1",
        workspaceId: "ws-1",
        name: "Updated",
        shortCode: "UPD",
        repositoryUrl: "https://github.com/owner/repo",
        workflowConfiguration: {
          version: "1",
          onTaskCompleted: "push-branch",
        },
        queueState: "idle",
        forgeType: "github",
        forgeBaseUrl: "https://github.com",
        hasForgeToken: false,
        agentConfig: null,
      },
    };

    eventSourceInstance?.dispatchEvent?.(
      "project.updated",
      JSON.stringify(projectPayload),
    );

    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        ["projects", "ws-1"],
        expect.any(Function),
      );
    });
  });

  it("updates subscription URL when selected project changes", async () => {
    useParams.mockReturnValue({ projectId: "proj-1" });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <LiveEventsProvider>
          <div>children</div>
        </LiveEventsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(eventSourceInstance?.url).toContain("proj-1");
    });

    useParams.mockReturnValue({ projectId: "proj-2" });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <LiveEventsProvider>
          <div>children</div>
        </LiveEventsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(eventSourceInstance?.url).toContain("proj-2");
    });
  });
});
