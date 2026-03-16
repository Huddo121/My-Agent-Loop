import type { WorkspaceId } from "@mono/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleLiveEvents } from "../live-events-route";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

vi.mock("../../auth/session", () => ({
  requireAuthSession,
}));

let abortCallbacks: (() => void)[] = [];
let streamSSECallback:
  | ((stream: {
      writeSSE: (msg: unknown) => Promise<void>;
      onAbort: (fn: () => void) => void;
    }) => Promise<void>)
  | null = null;

vi.mock("hono/streaming", () => ({
  streamSSE: vi.fn(
    (
      _c: unknown,
      fn: (stream: {
        writeSSE: (msg: unknown) => Promise<void>;
        onAbort: (fn: () => void) => void;
      }) => Promise<void>,
    ) => {
      abortCallbacks = [];
      streamSSECallback = fn;
      return new Response(null, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  ),
}));

function createCtx(
  url: string,
  overrides?: Partial<Record<string, unknown>>,
): {
  req: { url: string; param: () => Record<string, string> };
} {
  const urlObj = new URL(url, "http://localhost");
  const workspaceId =
    urlObj.pathname.match(/workspaces\/([^/]+)/)?.[1] ?? "ws-1";
  return {
    req: {
      url: url,
      raw: new Request(url),
      param: () => ({ workspaceId }),
    },
    ...overrides,
  } as unknown as { req: { url: string; param: () => Record<string, string> } };
}

function createServices(overrides?: Partial<Record<string, unknown>>) {
  const unregister = vi.fn();
  const register = vi.fn().mockReturnValue("conn-1");
  return {
    workspaceMembershipsService: {
      isWorkspaceMember: vi.fn(),
    },
    liveEventsService: {
      register,
      unregister,
    },
    ...overrides,
  };
}

describe("handleLiveEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    abortCallbacks = [];
    streamSSECallback = null;
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuthSession.mockResolvedValueOnce(null);
    const ctx = createCtx("http://localhost/api/workspaces/ws-1/live-events");
    const services = createServices();

    const response = await handleLiveEvents(
      {
        req: ctx.req,
        json: (body: unknown, status: number) =>
          new Response(JSON.stringify(body), { status }),
      } as never,
      services as never,
    );

    expect(response.status).toBe(401);
    expect(services.liveEventsService.register).not.toHaveBeenCalled();
  });

  it("returns 404 when caller is not a workspace member", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx("http://localhost/api/workspaces/ws-1/live-events");
    const services = createServices();
    services.workspaceMembershipsService.isWorkspaceMember.mockResolvedValueOnce(
      false,
    );

    const response = await handleLiveEvents(
      {
        req: ctx.req,
        json: (body: unknown, status: number) =>
          new Response(JSON.stringify(body), { status }),
      } as never,
      services as never,
    );

    expect(response.status).toBe(404);
    expect(services.liveEventsService.register).not.toHaveBeenCalled();
  });

  it("returns 400 when subscription param is invalid", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx(
      "http://localhost/api/workspaces/ws-1/live-events?subscription=invalid",
    );
    const services = createServices();
    services.workspaceMembershipsService.isWorkspaceMember.mockResolvedValueOnce(
      true,
    );

    const response = await handleLiveEvents(
      {
        req: ctx.req,
        json: (body: unknown, status: number) =>
          new Response(JSON.stringify(body), { status }),
      } as never,
      services as never,
    );

    expect(response.status).toBe(400);
    expect(services.liveEventsService.register).not.toHaveBeenCalled();
  });

  it("registers connection and unregisters on stream abort", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx(
      "http://localhost/api/workspaces/ws-1/live-events?subscription=workspace-projects",
    );
    const services = createServices();
    services.workspaceMembershipsService.isWorkspaceMember.mockResolvedValueOnce(
      true,
    );

    const responsePromise = handleLiveEvents(
      {
        req: ctx.req,
        json: (body: unknown, status: number) =>
          new Response(JSON.stringify(body), { status }),
      } as never,
      services as never,
    );

    // Allow the streamSSE callback to run
    await vi.waitFor(() => {
      expect(streamSSECallback).toBeTruthy();
    });

    const writeSSE = vi.fn().mockResolvedValue(undefined);
    const mockStream = {
      writeSSE,
      onAbort: (fn: () => void) => abortCallbacks.push(fn),
    };

    if (streamSSECallback) {
      const callbackPromise = streamSSECallback(mockStream);
      // Simulate client disconnect
      for (const cb of abortCallbacks) cb();

      await callbackPromise;
    }

    await responsePromise;

    expect(services.liveEventsService.register).toHaveBeenCalledWith({
      workspaceId: "ws-1" as WorkspaceId,
      subscriptions: [{ type: "workspace-projects" }],
      send: expect.any(Function),
    });
    expect(services.liveEventsService.unregister).toHaveBeenCalledWith(
      "conn-1",
    );
  });
});
