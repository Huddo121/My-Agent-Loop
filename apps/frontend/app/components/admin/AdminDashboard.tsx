import { AppLayout } from "~/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useAdminStats } from "~/hooks/useAdminStats";
import { AdminSidebar } from "./AdminSidebar";

export function AdminDashboard() {
  const { data: stats, isLoading, error } = useAdminStats();

  if (isLoading) {
    return (
      <AppLayout sidebar={<AdminSidebar />}>
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={`skeleton-${index}`}
                className="h-32 bg-gray-200 animate-pulse rounded-lg"
              />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout sidebar={<AdminSidebar />}>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            Failed to load admin statistics: {error.message}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!stats) {
    return (
      <AppLayout sidebar={<AdminSidebar />}>
        <div className="p-6">
          <div className="text-center text-gray-500">
            No statistics available
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout sidebar={<AdminSidebar />}>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-gray-600">
            System overview and job queue statistics
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Waiting Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.runQueue.waiting}</div>
              <p className="text-xs text-muted-foreground">
                Jobs waiting to be processed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.runQueue.active}</div>
              <p className="text-xs text-muted-foreground">
                Currently being processed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Completed Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.runQueue.completed}
              </div>
              <p className="text-xs text-muted-foreground">
                Successfully finished jobs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.runQueue.failed}</div>
              <p className="text-xs text-muted-foreground">
                Jobs that failed to complete
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Queue Information</CardTitle>
              <CardDescription>Details about the job queue</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Queue Name:</span>
                <span className="text-sm">{stats.metadata.queueName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Worker Status:</span>
                <span
                  className={`text-sm ${stats.metadata.isWorkerRunning ? "text-green-600" : "text-red-600"}`}
                >
                  {stats.metadata.isWorkerRunning ? "Running" : "Stopped"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Total Jobs:</span>
                <span className="text-sm">{stats.runQueue.total}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job Timeline</CardTitle>
              <CardDescription>
                Oldest and newest job information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Oldest Job:</span>
                <span className="text-sm">
                  {stats.metadata.oldestJobTimestamp
                    ? new Date(
                        stats.metadata.oldestJobTimestamp,
                      ).toLocaleString()
                    : "No jobs"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Newest Job:</span>
                <span className="text-sm">
                  {stats.metadata.newestJobTimestamp
                    ? new Date(
                        stats.metadata.newestJobTimestamp,
                      ).toLocaleString()
                    : "No jobs"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium">Avg Wait Time:</span>
                <span className="text-sm">
                  {stats.metadata.averageWaitTime
                    ? `${stats.metadata.averageWaitTime.toFixed(2)}s`
                    : "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
