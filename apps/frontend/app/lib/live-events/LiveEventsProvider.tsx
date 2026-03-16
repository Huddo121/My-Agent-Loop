import { liveEventDtoSchema } from "@mono/api";
import { useEffect } from "react";
import { useParams } from "react-router";
import { useCurrentWorkspace } from "~/lib/workspaces";

/**
 * Opens one EventSource per workspace, subscribed to workspace-projects and
 * (when a project is selected) project-board:projectId. Mounts inside
 * CurrentWorkspaceProvider after auth and workspace membership are resolved.
 * Recreates the stream when the derived subscription set changes.
 *
 * Cache updates are handled in the cache-updates TODO; this provider only
 * establishes the connection and receives events.
 */
export function LiveEventsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = useCurrentWorkspace();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();

  useEffect(() => {
    const subs = [
      "workspace-projects",
      ...(routeProjectId ? [`project-board:${routeProjectId}`] : []),
    ];
    const subscriptionParams = subs
      .map((s) => `subscription=${encodeURIComponent(s)}`)
      .join("&");
    const url = `/api/workspaces/${workspace.id}/live-events?${subscriptionParams}`;

    const es = new EventSource(url);

    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        const result = liveEventDtoSchema.safeParse(parsed);
        if (result.success) {
          // Cache updates will be wired in the cache-updates TODO
          // For now we just receive and discard
          void result.data;
        }
      } catch {
        // Ignore unparseable messages
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect by default. Reconnect behavior
      // (invalidation on reconnect, stop on auth failure) is the reconnect-behavior TODO.
    };

    return () => {
      es.close();
    };
  }, [workspace.id, routeProjectId]);

  return <>{children}</>;
}
