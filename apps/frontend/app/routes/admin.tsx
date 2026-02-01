import { useCallback } from "react";
import { AppLayout } from "~/components/layout";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useClearQueue, useQueueStats } from "~/hooks/useAdmin";

export function meta() {
  return [
    { title: "Admin - My Agent Loop" },
    {
      name: "description",
      content: "Admin dashboard for managing the system",
    },
  ];
}

export default function AdminRoute() {
  const { data: queueStats, isLoading } = useQueueStats();
  const clearQueueMutation = useClearQueue();

  const handleClearQueue = useCallback(
    (queueName: string) => {
      if (
        confirm(
          `Are you sure you want to clear the "${queueName}" queue? This will remove all jobs.`,
        )
      ) {
        clearQueueMutation.mutate(queueName);
      }
    },
    [clearQueueMutation],
  );

  return (
    <AppLayout sidebar={<div className="p-4 text-muted-foreground">Admin</div>}>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Queue Statistics</CardTitle>
              <CardDescription>
                Current status of the workflow job queues
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-muted-foreground">Loading...</div>
              ) : queueStats?.queues.length === 0 ? (
                <div className="text-muted-foreground">No queues found</div>
              ) : (
                <div className="space-y-4">
                  {queueStats?.queues.map((queue) => (
                    <div key={queue.name} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-lg">{queue.name}</h3>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleClearQueue(queue.name)}
                          disabled={clearQueueMutation.isPending}
                        >
                          {clearQueueMutation.isPending
                            ? "Clearing..."
                            : "Clear Queue"}
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {queue.jobCounts.waiting}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Waiting
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {queue.jobCounts.active}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Active
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-600">
                            {queue.jobCounts.completed}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Completed
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-600">
                            {queue.jobCounts.failed}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Failed
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-yellow-600">
                            {queue.jobCounts.delayed}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Delayed
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            {queue.jobCounts.paused}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Paused
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
