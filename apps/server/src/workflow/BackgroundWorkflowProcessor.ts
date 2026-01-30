import type { ProjectId } from "@mono/api";
import { type Job, Worker } from "bullmq";
import type { Database } from "../db";
import type { GitService } from "../git/GitService";
import type { ProjectsService } from "../projects/ProjectsService";
import type { RunId } from "../runs/RunId";
import type {
  Run,
  RunsService,
  UpdateRunStateError,
} from "../runs/RunsService";
import type { RunMode } from "../runs/runs-model";
import type { TaskQueue } from "../task-queue";
import type { Result } from "../utils/Result";
import { withNewTransaction } from "../utils/transaction-context";
import { realiseWorkflowConfiguration } from "./Workflow";
import type { WorkflowExecutionService } from "./WorkflowExecutionService";
import {
  RUN_QUEUE,
  type RunQueueJobPayload,
  type WorkflowQueues,
} from "./workflow-queues";

export type BeginWorkflowError = { reason: "no-tasks-available" };

/**
 * This class is responsible for taking jobs from the Run queue and
 *   actually running the workflow.
 */
export class BackgroundWorkflowProcessor {
  constructor(
    private readonly workflowQueues: WorkflowQueues,
    private readonly taskQueue: TaskQueue,
    private readonly runsService: RunsService,
    private readonly projectsService: ProjectsService,
    private readonly workflowExecutionService: WorkflowExecutionService,
    /* Just passed through */ private readonly gitService: GitService,
    private readonly db: Database,
  ) {
    const runWorker = new Worker(RUN_QUEUE, (job) => this.processRun(job), {
      connection: workflowQueues.redisConnectionOptions,
      concurrency: 5,
    });

    runWorker.on("error", (reason) => {
      console.error("Run worker errored", {
        reason: reason.message,
      });
    });

    runWorker.on("failed", (job?: Job<RunQueueJobPayload>) => {
      console.error("Run worker failed", {
        reason: job?.failedReason ?? "no reason given",
        hasJob: job !== undefined,
        jobId: String(job?.id),
      });

      if (job) {
        withNewTransaction(db, async () => {
          return await this.markRunAsFailed(job.data.runId);
        });
      }
    });
  }

  /**
   * Async job processer that handles Jobs from BullMQ.
   * This should not be called by any other services.
   */
  private async processRun(job: Job<RunQueueJobPayload>): Promise<void> {
    // Explicitly updating run state updates outside of the transaction so other parts of the codebase can pick up on the change ASAP
    const runId = job.data.runId;
    const loggingContext = {
      projectId: job.data.projectId,
      runId,
      taskId: job.data.taskId,
      jobId: job.id,
    };
    const inProgressResult = await this.markRunAsInProgress(runId);
    if (inProgressResult.success === false) {
      console.error("Failed to mark run as in progress", {
        runId,
        error: inProgressResult.error.reason,
      });
      return;
    }

    try {
      const result = await withNewTransaction(
        this.db,
        async (): Promise<
          Result<
            RunId,
            | { reason: "task-not-found" }
            | { reason: "project-not-found" }
            | { reason: "execution-failed" }
            | { reason: "task-already-completed" }
          >
        > => {
          // Get the all the data we need for the run
          const task = await this.taskQueue.getTask(job.data.taskId);
          if (task === undefined) {
            return { success: false, error: { reason: "task-not-found" } };
          }

          if (task.completedOn !== undefined) {
            return {
              success: false,
              error: { reason: "task-already-completed" },
            };
          }

          const project = await this.projectsService.getProject(
            job.data.projectId,
          );

          if (project === undefined) {
            return { success: false, error: { reason: "project-not-found" } };
          }

          const workflow = realiseWorkflowConfiguration(
            project.workflowConfiguration,
            {
              gitService: this.gitService,
            },
          );

          const executionResult =
            await this.workflowExecutionService.executeWorkflow(
              runId,
              task,
              project,
              workflow,
            );

          if (executionResult.success === false) {
            return { success: false, error: { reason: "execution-failed" } };
          }

          return { success: true, value: runId };
        },
      );

      if (result.success === false) {
        console.warn("A Run failed", {
          ...loggingContext,
          error: result.error.reason,
        });
        const failedResult = await this.markRunAsFailed(runId);
        if (failedResult.success === false) {
          console.error("Failed to mark run as failed", {
            runId,
            error: failedResult.error.reason,
          });
        }
      } else {
        const completedResult = await this.markRunAsCompleted(runId);
        if (completedResult.success === false) {
          console.error("Failed to mark run as completed", {
            ...loggingContext,
            error: completedResult.error.reason,
          });
          return;
        }

        // Finished processing the run, queue up the next task
        if (job.data.mode === "loop") {
          await withNewTransaction(this.db, async () => {
            return await this.queueNextTask(job.data.projectId, job.data.mode);
          });
        }
      }
    } catch (error) {
      // Catching the error here so that BullMQ doesn't retry the job for the same Run
      console.error("Error occurred while processing run", {
        ...loggingContext,
        error,
      });
      await this.markRunAsFailed(runId);
    }
  }

  async queueNextTask(
    projectId: ProjectId,
    mode: RunMode,
  ): Promise<Result<RunId, BeginWorkflowError>> {
    // Pick a task to process
    const task = await this.taskQueue.getNextTask(projectId);

    if (task === undefined) {
      console.info("No tasks left to process", { projectId, mode });
      return { success: false, error: { reason: "no-tasks-available" } };
    }

    const run = await this.runsService.createRun(task.id);

    const newJob = await this.workflowQueues.runQueue.add(`run-${run.id}`, {
      projectId,
      taskId: task.id,
      runId: run.id,
      mode,
    });

    console.info("Added run to queue", {
      projectId,
      mode,
      runId: run.id,
      jobId: newJob.id,
    });

    return { success: true, value: run.id };
  }

  private async markRunAsInProgress(
    runId: RunId,
  ): Promise<Result<Run, UpdateRunStateError>> {
    return await withNewTransaction(this.db, () =>
      this.runsService.updateRunState(runId, "in_progress"),
    );
  }

  private async markRunAsCompleted(
    runId: RunId,
  ): Promise<Result<Run, UpdateRunStateError>> {
    return await withNewTransaction(this.db, () =>
      this.runsService.updateRunState(runId, "completed"),
    );
  }

  private async markRunAsFailed(
    runId: RunId,
  ): Promise<Result<Run, UpdateRunStateError>> {
    return await withNewTransaction(this.db, () =>
      this.runsService.updateRunState(runId, "failed"),
    );
  }
}
