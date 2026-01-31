import type { QueueStatsResponse } from "@mono/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "~/lib/api-client";

const ADMIN_QUERY_KEY = ["admin", "queue-stats"] as const;

/**
 * Hook to fetch queue statistics.
 */
export function useQueueStats() {
  return useQuery({
    queryKey: ADMIN_QUERY_KEY,
    queryFn: async (): Promise<QueueStatsResponse> => {
      const response = await apiClient.admin.GET();
      if (response.status === 200) {
        return response.responseBody;
      }
      throw new Error("Failed to fetch queue statistics");
    },
  });
}

/**
 * Hook to clear a queue.
 */
export function useClearQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (queueName: string): Promise<boolean> => {
      const response = await apiClient.admin["clear-queue"].POST({
        body: { queueName },
      });
      if (response.status === 200) {
        return response.responseBody.success;
      }
      throw new Error("Failed to clear queue");
    },
    onSuccess: () => {
      // Invalidate the queue stats query to refresh the data
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEY });
    },
  });
}
