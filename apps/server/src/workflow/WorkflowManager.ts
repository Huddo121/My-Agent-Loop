import type { ProjectId, TaskId } from "@mono/api";
import { match } from "ts-pattern";
import type { Database } from "../db";
import type { ForgeSecretRepository } from "../forge-secrets";
import type { LiveEventsService } from "../live-events";
import type { Project, ProjectsService } from "../projects/ProjectsService";
import type { RunId } from "../runs/RunId";
import type { Run, RunsService } from "../runs/RunsService";
import type { RunMode } from "../runs/runs-model";
import type { TaskQueue } from "../task-queue/TaskQueue";
import type { Result } from "../utils/Result";
import { withNewTransaction } from "../utils/transaction-context";
import type { WorkflowMessengerService } from "./WorkflowMessengerService";
import type { WorkflowQueues } from "./workflow-queues";

export type BeginWorkflowError =
  | { reason: "no-tasks-available" }
  | { reason: "project-not-found" }
  | { reason: "project-already-processing-tasks" };

/**
 * The WorkflowManager is responsible for the orchestration of the workflow.
 * It deals with the state of projects and responding to changes in run state.
 */
export interface WorkflowManager {
  startWorkflow(
    projectId: ProjectId,
    mode: RunMode,
  ): Promise<Result<RunId, BeginWorkflowError>>;
}

export class DatabaseWorkflowManager implements WorkflowManager {
  constructor(
    workflowMessengerService: WorkflowMessengerService,
    private readonly taskQueue: TaskQueue,
    private readonly runsService: RunsService,
    private readonly projectsService: ProjectsService,
    private readonly workflowQueues: WorkflowQueues,
    private readonly db: Database,
    private readonly liveEventsService: LiveEventsService,
    private readonly forgeSecretRepository: ForgeSecretRepository,
  ) {
    workflowMessengerService.onRunCompleted(this.handleRunCompleted.bind(this));
    workflowMessengerService.onRunFailed(this.handleRunFailed.bind(this));
  }

  async startWorkflow(
    projectId: ProjectId,
    mode: RunMode,
  ): Promise<Result<RunId, BeginWorkflowError>> {
    const project = await this.projectsService.getProject(projectId);
    if (project === undefined) {
      console.error("Project not found", { projectId, mode });
      return { success: false, error: { reason: "project-not-found" } };
    }

    const queueState = project.queueState;

    const canStart = match(queueState)
      .with("idle", "failed", "stopping", () => true)
      .with("processing-loop", "processing-single", () => false)
      .exhaustive();

    if (!canStart) {
      console.warn(
        "Can not start workflow, project is already processing tasks",
        {
          projectId,
          mode,
          queueState,
        },
      );
      return {
        success: false,
        error: { reason: "project-already-processing-tasks" },
      };
    }

    // Pick a task to process
    const task = await this.taskQueue.getNextTask(projectId);

    if (task === undefined) {
      console.info("No tasks left to process", { projectId, mode });
      return { success: false, error: { reason: "no-tasks-available" } };
    }

    const newQueueState = match(mode)
      .with("loop", () => "processing-loop" as const)
      .with("single", () => "processing-single" as const)
      .exhaustive();

    const updatedProject = await this.projectsService.updateProjectQueueState(
      projectId,
      newQueueState,
    );
    if (updatedProject !== undefined) {
      await this.publishProjectUpdated(updatedProject);
    }

    const run = await this.queueProcessingOfTask(projectId, task.id);

    return { success: true, value: run.id };
  }

  private async publishProjectUpdated(project: Project): Promise<void> {
    const hasForgeToken = await this.forgeSecretRepository.hasForgeSecret(
      project.id,
    );
    const projectDto = { ...project, hasForgeToken };
    await this.liveEventsService.publish(project.workspaceId, {
      type: "project.updated",
      project: projectDto,
    });
  }

  private async queueProcessingOfTask(
    projectId: ProjectId,
    taskId: TaskId,
  ): Promise<Run> {
    const run = await this.runsService.createRun(taskId);

    const newJob = await this.workflowQueues.runQueue.add(`run-${run.id}`, {
      projectId,
      taskId,
      runId: run.id,
    });

    console.info("Added run to queue", {
      projectId,
      runId: run.id,
      jobId: newJob.id,
    });

    return run;
  }

  /**
   * React to a run being completed
   * Since this is running in response to a change in state from the job queue, we'll need to
   *   run it in a new transaction. Think of this as if it was triggered in reaction to a message
   *   from a queue, but in reality this is all happening in-node at the moment.
   */
  private async handleRunCompleted(
    projectId: ProjectId,
    runId: RunId,
  ): Promise<void> {
    return await withNewTransaction(this.db, async () => {
      // Look up the run mode
      const project = await this.projectsService.getProject(projectId);
      if (project === undefined) {
        console.error("Project not found, can not handle run completion", {
          projectId,
          runId,
        });
        return;
      }
      const queueState = project.queueState;

      // Check if we're in loop mode, if so, check if there's more tasks
      await match(queueState)
        .with("processing-loop", async () => {
          const nextTask = await this.taskQueue.getNextTask(projectId);
          if (nextTask === undefined) {
            const updatedProject =
              await this.projectsService.updateProjectQueueState(
                projectId,
                "idle",
              );
            if (updatedProject === undefined) {
              console.error(
                "Failed to update project queue state, could not find project",
                { projectId, runId },
              );
              return;
            }
            await this.publishProjectUpdated(updatedProject);
            console.info(
              "No more tasks left to process, updated project queue state to idle",
              { projectId, runId },
            );
            return;
          }

          await this.queueProcessingOfTask(project.id, nextTask.id);
        })
        .with("processing-single", async () => {
          const updatedProject =
            await this.projectsService.updateProjectQueueState(
              projectId,
              "idle",
            );
          if (updatedProject === undefined) {
            console.error(
              "Failed to update project queue state, could not find project",
              { projectId, runId },
            );
            return;
          }
          await this.publishProjectUpdated(updatedProject);
          console.info(
            "Finished processing single task, updated project queue state to idle",
            { projectId, runId },
          );
          return;
        })
        .with("stopping", async () => {
          const updatedProject =
            await this.projectsService.updateProjectQueueState(
              projectId,
              "idle",
            );
          if (updatedProject === undefined) {
            console.error(
              "Failed to update project queue state, could not find project",
              { projectId, runId },
            );
            return;
          }
          await this.publishProjectUpdated(updatedProject);
          console.info(
            "Run completed while queue was stopping, updated project queue state to idle",
            { projectId, runId },
          );
          return;
        })
        .with("idle", "failed", async () => {
          console.error(
            "Found project in an invalid state while handling run completion",
            { projectId, runId, queueState },
          );
          return;
        })
        .exhaustive();
    });
  }

  private async handleRunFailed(
    projectId: ProjectId,
    runId: RunId,
  ): Promise<void> {
    return await withNewTransaction(this.db, async () => {
      const project = await this.projectsService.getProject(projectId);
      if (project === undefined) {
        console.error("Project not found, can not handle run failure", {
          projectId,
          runId,
        });
        return;
      }
      const queueState = project.queueState;

      // TODO: When we get to having multiple runs per project we'll need to think about what to do to other runs
      await match(queueState)
        .with("processing-loop", "processing-single", "stopping", async () => {
          const updatedProject =
            await this.projectsService.updateProjectQueueState(
              projectId,
              "failed",
            );
          if (updatedProject !== undefined) {
            await this.publishProjectUpdated(updatedProject);
          }
          console.info("Updated project queue state to failed", {
            projectId,
            runId,
            previousQueueState: queueState,
          });
        })
        .with("failed", () => {
          console.warn(
            "Project is already in failed state, not updating queue state unnecessarily",
            { projectId, runId, queueState },
          );
        })
        .with("idle", () => {
          console.error(
            "Project is in idle state, can not handle run failure",
            { projectId, runId, previousQueueState: queueState },
          );
        })
        .exhaustive();
    });
  }
}
