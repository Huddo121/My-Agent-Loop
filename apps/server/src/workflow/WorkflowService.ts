import fs from "node:fs";
import type { ProjectId, TaskId } from "@mono/api";
import type { RunId } from "../common/RunId";
import { generateRunId } from "../common/RunId";
import { AbsoluteFilePath } from "../file-system/FilePath";
import type { FileSystemService } from "../file-system/FileSystemService";
import type { GitBranch, GitRepository } from "../git/GitRepository";
import type { GitService } from "../git/GitService";
import type { ProjectsService } from "../projects/ProjectsService";
import type { SandboxService } from "../sandbox/SandboxService";
import type { Task, TaskQueue } from "../task-queue/TaskQueue";
import { absolutePath } from "../utils/absolutePath";
import type { Result } from "../utils/Result";
import { timeout } from "../utils/timeout";

const formatTaskFile = (task: Task): string => {
  return `# ${task.title}

${task.description}
`;
};

const commitAndPushThenMergeToMaster =
  (gitService: GitService) =>
  async (
    task: Task,
    repository: GitRepository,
  ): Promise<Result<void, Error>> => {
    const workBranch = repository.branch;
    const commitResult = await gitService.commitRepository(
      repository,
      `Completed task ${task.id} - ${task.title}\n\n${task.description}`,
    );
    if (commitResult.success === false) {
      console.error(
        `Failed to commit task ${task.id}:`,
        commitResult.error.message,
      );
      return { success: false, error: commitResult.error };
    }

    await gitService.pushRepository(repository);
    const mainBranch = await gitService.detectMainBranch(repository);
    if (mainBranch.success === false) {
      return { success: false, error: mainBranch.error };
    }

    const checkoutResult = await gitService.checkoutBranch(
      repository,
      mainBranch.value,
    );
    if (checkoutResult.success === false) {
      return { success: false, error: checkoutResult.error };
    }

    const mergeResult = await gitService.mergeBranchInToCurrentBranch(
      repository,
      workBranch,
    );
    if (mergeResult.success === false) {
      return { success: false, error: mergeResult.error };
    }

    const pushResult = await gitService.pushRepository(repository);

    if (pushResult.success === false) {
      console.error(
        `Failed to merge and push task ${task.id}:`,
        pushResult.error.message,
      );
      return {
        success: false,
        error: new Error(
          `Could not merge code change: ${pushResult.error.message}`,
        ),
      };
    }

    return { success: true, value: undefined };
  };

interface Workflow {
  onTaskCompleted(
    task: Task,
    repository: GitRepository,
  ): Promise<Result<void, Error>>;
}

const yoloWorkflow = (gitService: GitService): Workflow => ({
  onTaskCompleted: commitAndPushThenMergeToMaster(gitService),
});

const reviewWorkflow = (gitService: GitService): Workflow => ({
  async onTaskCompleted(task, repository) {
    // Commit the work
    const commitResult = await gitService.commitRepository(
      repository,
      `Completed task ${task.id} - ${task.title}\n\n${task.description}`,
    );
    if (commitResult.success === false) {
      return { success: false, error: commitResult.error };
    }
    // Push it
    const pushResult = await gitService.pushRepository(repository);
    return pushResult;
  },
});

type WorkflowKind = "yolo" | "review";

const repositoryUrl = "git@gitlab.com:huddo121/my-agent-loop.git";

export class WorkflowService {
  constructor(
    private readonly taskQueue: TaskQueue,
    private readonly projectsService: ProjectsService,
    private readonly gitService: GitService,
    private readonly sandboxService: SandboxService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  async processNextTask(
    projectId: ProjectId,
  ): Promise<Result<TaskId | undefined, Error>> {
    const project = await this.projectsService.getProject(projectId);
    if (project === undefined) {
      return {
        success: false,
        error: new Error(`Project ${projectId} not found`),
      };
    }

    // const workflowKind = project.workflowKind;
    const workflowKind = "review" as WorkflowKind;

    const workflow =
      workflowKind === "yolo"
        ? yoloWorkflow(this.gitService)
        : reviewWorkflow(this.gitService);

    const task = await this.taskQueue.getNextTask(projectId);
    if (task) {
      const runId = generateRunId();
      console.log(
        `Processing task ${task.id} (run: ${runId})\n${task.description}`,
      );
      const result = await this.processTask(task, runId, workflow);
      if (result.success === true) {
        return { success: true, value: task.id };
      } else {
        return result;
      }
    } else {
      console.info("No tasks available to process", {
        projectId,
        workflowKind,
      });
      return { success: true, value: undefined };
    }
  }

  /** Start processing tasks, and running a sub-agent for each task until a run fails or all tasks are completed */
  async startProcessing(projectId: ProjectId) {
    const project = await this.projectsService.getProject(projectId);
    if (project === undefined) {
      return {
        success: false,
        error: new Error(`Project ${projectId} not found`),
      };
    }

    // const workflowKind = project.workflowKind;
    const workflowKind = "review" as WorkflowKind;

    const workflow =
      workflowKind === "yolo"
        ? yoloWorkflow(this.gitService)
        : reviewWorkflow(this.gitService);
    while (!(await this.taskQueue.isEmpty(projectId))) {
      const task = await this.taskQueue.getNextTask(projectId);
      if (task) {
        // Generate a unique run ID for this task processing attempt
        const runId = generateRunId();
        console.log(
          `Processing task ${task.id} (run: ${runId})\n${task.description}`,
        );
        const result = await this.processTask(task, runId, workflow);
        if (result.success === false) {
          console.error(
            `Failed to process task ${task.id}:`,
            result.error.message,
          );
          return;
        }
      } else {
        console.info("No tasks available to process", {
          projectId,
          workflowKind,
        });
        break;
      }
    }
    console.log("Processed all tasks");
  }

  private async processTask(
    task: Task,
    runId: RunId,
    workflow: Workflow,
  ): Promise<Result<void, Error>> {
    // Prepare files
    // Create a temporary folder for the run
    const taskTempDirectory =
      await this.fileSystemService.createTemporaryDirectory(runId);

    const repositoryPath = AbsoluteFilePath.joinPath(taskTempDirectory, "code");

    // Check out code to temporary folder
    const checkoutResult = await this.gitService.checkoutRepository({
      repositoryUrl,
      targetDirectory: repositoryPath,
      branch: `tasks/task-${task.id}-${runId}` as GitBranch,
    });

    if (checkoutResult.success === false) {
      console.error(
        `Failed to checkout repository for task ${task.id}:`,
        checkoutResult.error.message,
      );
      return { success: false, error: checkoutResult.error };
    }

    const taskFilePath = AbsoluteFilePath.joinPath(
      taskTempDirectory,
      "task.txt",
    );
    // Write out task to file to mount to the container
    fs.writeFileSync(taskFilePath, formatTaskFile(task));

    const repository = checkoutResult.value;

    const sandbox = await this.sandboxService.createNewSandbox({
      volumes: [
        { hostPath: repository.path, containerPath: "/code" },
        { hostPath: taskFilePath, containerPath: "/task.txt" },
        {
          hostPath: absolutePath(import.meta.url, "opencode.json"),
          // Mounting the default config to the container's config directory allows end users to override the config.
          // See https://opencode.ai/docs/config/#precedence-order
          containerPath: "/root/.config/opencode/opencode.json",
        },
      ],
    });

    await this.sandboxService.startSandbox(sandbox.id);

    const oneHourInMs = 3600000;
    const result = await timeout(
      this.sandboxService.waitForSandboxToFinish(sandbox.id),
      oneHourInMs,
    ).catch(() => ({ success: false, error: { reason: "timeout" } }) as const);

    if (result.success === false) {
      return {
        success: false,
        error: new Error(
          `Failed to wait for sandbox ${sandbox.id}: ${result.error.reason}`,
        ),
      };
    }

    console.log(
      `Container ${sandbox.id} exited with code ${result.value.exitCode}, reason: ${result.value.reason}`,
    );

    if (result.value.reason === "completed") {
      const commitResult = await this.gitService.commitRepository(
        repository,
        `Completed task ${task.id} - ${task.title}\n\n${task.description}`,
      );
      if (commitResult.success === false) {
        console.error(
          `Failed to commit task ${task.id}:`,
          commitResult.error.message,
        );
        return { success: false, error: commitResult.error };
      }

      const workflowOnTaskCompletedResult = await workflow.onTaskCompleted(
        task,
        repository,
      );

      if (workflowOnTaskCompletedResult.success === false) {
        console.error(
          `Failed to complete task ${task.id}:`,
          workflowOnTaskCompletedResult.error.message,
        );
        return { success: false, error: workflowOnTaskCompletedResult.error };
      }

      await this.taskQueue.completeTask(task.id);
    }

    await this.sandboxService.stopSandbox(sandbox.id);
    if (result.value.reason !== "completed") {
      return {
        success: false,
        error: new Error(
          `Container ${sandbox.id} exited with code ${result.value.exitCode}, reason: ${result.value.reason}`,
        ),
      };
    }
    return { success: true, value: undefined };
  }
}
