import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveEventsProvider } from "../LiveEventsProvider";

const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined);
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
} as unknown as InstanceType<typeof QueryClient>;

const { useQueryClient, mockSessionGet } = vi.hoisted(() => {
  const mockSessionGet = vi.fn();
  return {
    useQueryClient: vi.fn(() => mockQueryClient),
    mockSessionGet,
  };
});
const { useParams } = vi.hoisted(() => ({
  useParams: vi.fn(),
}));
const { useCurrentWorkspace } = vi.hoisted(() => ({
  useCurrentWorkspace: vi.fn(),
}));

let eventSourceInstance: {
  url: string;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  close: () => void;
} | null = null;

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient,
  };
});

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
    onmessage: ((ev: { data: string }) => void) | null = null;

    constructor(url: string) {
      this.url = url;
      eventSourceInstance = this;
    }

    close() {
      eventSourceInstance = null;
    }
  },
);

describe("LiveEventsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      <QueryClientProvider client={new QueryClient()}>
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
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["projects", "ws-1"],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["tasks", "proj-1"],
      });
    });
  });

  it("closes EventSource and stops reconnecting when session returns 401", async () => {
    useParams.mockReturnValue({ projectId: "proj-1" });
    mockSessionGet.mockResolvedValue({ status: 401 });

    render(
      <QueryClientProvider client={new QueryClient()}>
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

  it("updates subscription URL when selected project changes", async () => {
    useParams.mockReturnValue({ projectId: "proj-1" });
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient()}>
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
