import type { WorkspaceId } from "@mono/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "../auth/UserId";
import {
  FakeDatabase,
  FakeLiveEventsSseRegistry,
  FakeWorkspaceMembershipsService,
} from "../test-fakes";
import { handleLiveEvents } from "./live-events-route";

const { requireAuthSession } = vi.hoisted(() => ({
  requireAuthSession: vi.fn(),
}));

const { withNewTransaction } = vi.hoisted(() => ({
  withNewTransaction: vi.fn((_db: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock(import("../auth/session"), () => ({
  requireAuthSession,
}));

vi.mock(
  import("../utils/transaction-context"),
  () =>
    ({
      withNewTransaction,
    }) as unknown as Awaited<typeof import("../utils/transaction-context")>,
);

let abortCallbacks: (() => void)[] = [];
let streamSSECallback:
  | ((stream: {
      writeSSE: (msg: unknown) => Promise<void>;
      onAbort: (fn: () => void) => void;
    }) => Promise<void>)
  | null = null;

vi.mock(
  import("hono/streaming"),
  () =>
    ({
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
    }) as unknown as Awaited<typeof import("hono/streaming")>,
);

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

function createServices() {
  const db = new FakeDatabase();
  const workspaceMembershipsService = new FakeWorkspaceMembershipsService();
  const liveEventsService = new FakeLiveEventsSseRegistry();
  return {
    db: db.asDatabase(),
    workspaceMembershipsService,
    liveEventsService,
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
    expect(services.liveEventsService.registrations).toHaveLength(0);
  });

  it("returns 404 when caller is not a workspace member", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
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

    expect(response.status).toBe(404);
    expect(services.liveEventsService.registrations).toHaveLength(0);
  });

  it("returns 400 when subscription param is invalid", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctx = createCtx(
      "http://localhost/api/workspaces/ws-1/live-events?subscription=invalid",
    );
    const services = createServices();
    services.workspaceMembershipsService.grantWorkspaceMember(
      "user-1" as UserId,
      "ws-1" as WorkspaceId,
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
    expect(services.liveEventsService.registrations).toHaveLength(0);
  });

  it("registers connection and unregisters on stream abort", async () => {
    requireAuthSession.mockResolvedValueOnce({
      user: { id: "user-1" },
    });
    const ctxStr = createCtx(
      "http://localhost/api/workspaces/ws-1/live-events?subscription=workspace-projects",
    );
    const services = createServices();
    services.workspaceMembershipsService.grantWorkspaceMember(
      "user-1" as UserId,
      "ws-1" as WorkspaceId,
    );

    const responsePromise = handleLiveEvents(
      {
        req: ctxStr.req,
        json: (body: unknown, status: number) =>
          new Response(JSON.stringify(body), { status }),
      } as never,
      services as never,
    );

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
      for (const cb of abortCallbacks) cb();

      await callbackPromise;
    }

    await responsePromise;

    expect(services.liveEventsService.registrations[0]).toMatchObject({
      workspaceId: "ws-1" as WorkspaceId,
      subscriptions: [{ type: "workspace-projects" }],
    });
    expect(services.liveEventsService.registrations[0]?.send).toEqual(
      expect.any(Function),
    );
    expect(services.liveEventsService.unregisteredIds).toContain("conn-1");
  });
});
