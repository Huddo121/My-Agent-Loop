import fs from "node:fs";
import { AbsoluteFilePath } from "../file-system/FilePath";
import type { FileSystemService } from "../file-system/FileSystemService";
import type { GitBranch, GitRepository } from "../git/GitRepository";
import type { GitService } from "../git/GitService";
import type { Project } from "../projects/ProjectsService";
import type { RunId } from "../runs/RunId";
import type { Sandbox, SandboxService } from "../sandbox/SandboxService";
import type { Task, TaskQueue } from "../task-queue/TaskQueue";
import { absolutePath } from "../utils/absolutePath";
import type { Result } from "../utils/Result";
import { timeout } from "../utils/timeout";
import type { Workflow } from "./Workflow";

const formatTaskFile = (task: Task): string => {
  return `# ${task.title}

${task.description}
`;
};

/**
 * This class is responsible for the runtime execution of a workflow.
 * It will manage the lifecycle of the sandbox and ensures that all of the files necessary
 *   for the agent to execute are available (i.e. the code, the task, opencode config).
 */
export class WorkflowExecutionService {
  constructor(
    private readonly taskQueue: TaskQueue,
    private readonly gitService: GitService,
    private readonly sandboxService: SandboxService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  async executeWorkflow(
    runId: RunId,
    task: Task,
    project: Project,
    workflow: Workflow,
  ): Promise<Result<void, Error>> {
    const e = await this.processTask(project, task, runId, workflow);

    if (e.success === true) {
      return { success: true, value: undefined };
    } else {
      return { success: false, error: e.error };
    }
  }

  private async prepare(
    project: Project,
    runId: RunId,
    task: Task,
  ): Promise<Result<{ repository: GitRepository; sandbox: Sandbox }, Error>> {
    // Prepare files
    // Create a temporary folder for the run
    const taskTempDirectory =
      await this.fileSystemService.createTemporaryDirectory(runId);

    const repositoryPath = AbsoluteFilePath.joinPath(taskTempDirectory, "code");

    // Check out code to temporary folder
    const checkoutResult = await this.gitService.checkoutRepository({
      repositoryUrl: project.repositoryUrl,
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

    return { success: true, value: { repository, sandbox } };
  }

  private async processTask(
    project: Project,
    task: Task,
    runId: RunId,
    workflow: Workflow,
  ): Promise<Result<void, Error>> {
    const perpareResult = await this.prepare(project, runId, task);
    if (perpareResult.success === false) {
      return { success: false, error: perpareResult.error };
    }
    const { repository, sandbox } = perpareResult.value;

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
