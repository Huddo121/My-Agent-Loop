import { liveEventDtoSchema } from "@mono/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router";
import { useCurrentWorkspace } from "~/lib/workspaces";
import { applyProjectUpdated, applyTaskUpdated } from "./cache-helpers";

/**
 * Opens one EventSource per workspace, subscribed to workspace-projects and
 * (when a project is selected) project-board:projectId. Mounts inside
 * CurrentWorkspaceProvider after auth and workspace membership are resolved.
 * Recreates the stream when the derived subscription set changes.
 *
 * On each parsed event, updates React Query caches via cache helpers so the
 * board and projects stay in sync without full refetches.
 */
export function LiveEventsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspace = useCurrentWorkspace();
  const queryClient = useQueryClient();
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
          const data = result.data;
          switch (data.type) {
            case "project.updated":
              applyProjectUpdated(queryClient, data.project);
              break;
            case "task.updated":
              applyTaskUpdated(queryClient, data.projectId, data.task);
              break;
          }
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
  }, [workspace.id, routeProjectId, queryClient]);

  return <>{children}</>;
}
