import {
  badUserInput,
  notFound,
  parseSubscriptionStrings,
  unauthenticated,
  type WorkspaceId,
} from "@mono/api";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAuthSession } from "../auth/session";
import type { Services } from "../services";
import { withNewTransaction } from "../utils/transaction-context";

/**
 * Raw Hono GET handler for live-events SSE at /api/workspaces/:workspaceId/live-events.
 * Requires auth, workspace membership, validates subscription query params,
 * registers with LiveEventsService, streams SSE + keepalives, unregisters on abort/disconnect.
 */
export async function handleLiveEvents(
  c: Context,
  services: Services,
): Promise<Response> {
  const { workspaceId } = c.req.param();
  const authSession = await requireAuthSession(c.req.raw);
  if (authSession === null) {
    const [, body] = unauthenticated();
    return c.json(body, 401);
  }

  const canAccess = await withNewTransaction(services.db, async () =>
    services.workspaceMembershipsService.isWorkspaceMember(
      authSession.user.id,
      workspaceId as WorkspaceId,
    ),
  );
  if (!canAccess) {
    const [, body] = notFound();
    return c.json(body, 404);
  }

  const url = new URL(c.req.url);
  const subscriptionStrings = url.searchParams.getAll("subscription");
  const parsed = parseSubscriptionStrings(subscriptionStrings);
  if (!parsed.success) {
    const message =
      "error" in parsed
        ? (parsed.error.issues[0]?.message ?? "Invalid subscription parameter")
        : "Invalid subscription parameter";
    const [, body] = badUserInput(message);
    return c.json(body, 400);
  }

  return streamSSE(c, async (stream) => {
    const send = async (msg: {
      data: string | Promise<string>;
      event?: string;
      id?: string;
      retry?: number;
    }) => {
      const data = await Promise.resolve(msg.data);
      await stream.writeSSE({
        data,
        event: msg.event,
        id: msg.id,
        retry: msg.retry,
      });
    };

    const connectionId = services.liveEventsService.register({
      workspaceId: workspaceId as WorkspaceId,
      subscriptions: parsed.data,
      send,
    });

    stream.onAbort(() => {
      services.liveEventsService.unregister(connectionId);
    });

    // Keep the stream open until the client disconnects (onAbort)
    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve());
    });
  });
}
