import { liveEventDtoSchema, type ProjectId } from "@mono/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useParams } from "react-router";
import { tasksQueryKey } from "~/hooks/useTasks";
import { apiClient } from "~/lib/api-client";
import { projectsQueryKey } from "~/lib/projects/useProjects";
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
 *
 * On stream open or reconnect, invalidates workspace-projects and
 * project-board queries once so the UI catches up from canonical server state.
 * If the stream fails with auth (401), stops reconnecting so the normal
 * signed-out flow can take over.
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

    function invalidateOnOpen() {
      queryClient.invalidateQueries({
        queryKey: projectsQueryKey(workspace.id),
      });
      if (routeProjectId) {
        queryClient.invalidateQueries({
          queryKey: tasksQueryKey(routeProjectId as ProjectId),
        });
      }
    }

    es.onopen = () => {
      invalidateOnOpen();
    };

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

    es.onerror = async () => {
      // EventSource does not expose HTTP status. When the server returns 401,
      // the connection fails and we cannot distinguish it from other failures.
      // Check session explicitly: if unauthenticated, stop reconnecting so
      // the normal signed-out app flow can take over.
      try {
        const response = await apiClient.session.GET();
        if (response.status === 401) {
          es.close();
        }
      } catch {
        // Network error during session check; let EventSource retry
      }
    };

    return () => {
      es.close();
    };
  }, [workspace.id, routeProjectId, queryClient]);

  return <>{children}</>;
}
