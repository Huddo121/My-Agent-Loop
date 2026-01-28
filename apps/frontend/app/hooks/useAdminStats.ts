import type { QueueStatsResponse } from "@mono/api";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";

const ADMIN_STATS_QUERY_KEY = ["admin", "stats"] as const;

/**
 * Hook to fetch admin statistics including job queue information.
 */
export function useAdminStats() {
  return useQuery({
    queryKey: ADMIN_STATS_QUERY_KEY,
    queryFn: async (): Promise<QueueStatsResponse> => {
      const response = await apiClient.admin.stats();
      if (response.status === 200) {
        return response.responseBody;
      }
      throw new Error("Failed to fetch admin statistics");
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}
