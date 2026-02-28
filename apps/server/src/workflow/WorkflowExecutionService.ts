import fs from "node:fs";
import path from "node:path";
import { AbsoluteFilePath } from "../file-system/FilePath";
import type { FileSystemService } from "../file-system/FileSystemService";
import type { ForgeSecretRepository } from "../forge-secrets";
import type { GitBranch, GitRepository } from "../git/GitRepository";
import type { ForgeGitCredentials, GitService } from "../git/GitService";
import type { AgentHarness } from "../harness";
import type { AgentHarnessConfigRepository } from "../harness/AgentHarnessConfigRepository";
import type { HarnessAuthService } from "../harness/HarnessAuthService";
import type { Project } from "../projects/ProjectsService";
import type { RunId } from "../runs/RunId";
import type { Sandbox, SandboxService } from "../sandbox/SandboxService";
import type { Task, TaskQueue } from "../task-queue/TaskQueue";
import type { Result } from "../utils/Result";
import { timeout } from "../utils/timeout";
import type { Workflow } from "./Workflow";

const MCP_SERVER_URL = "http://host.docker.internal:3050/mcp";

const formatTaskFile = (task: Task): string => {
  return `# ${task.title}

${task.description}
`;
};

/**
 * This class is responsible for the runtime execution of a workflow.
 * It will manage the lifecycle of the sandbox and ensures that all of the files necessary
 *   for the agent to execute are available (i.e. the code, the task, and harness-specific config).
 */
export class WorkflowExecutionService {
  constructor(
    private readonly taskQueue: TaskQueue,
    private readonly gitService: GitService,
    private readonly sandboxService: SandboxService,
    private readonly fileSystemService: FileSystemService,
    private readonly harnesses: readonly AgentHarness[],
    private readonly harnessConfig: AgentHarnessConfigRepository,
    private readonly harnessAuthService: HarnessAuthService,
    private readonly forgeSecretRepository: ForgeSecretRepository,
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
    const taskTempDirectory =
      await this.fileSystemService.createTemporaryDirectory(runId);

    const repositoryPath = AbsoluteFilePath.joinPath(taskTempDirectory, "code");

    const secret = await this.forgeSecretRepository.getForgeSecret(project.id);
    if (secret === undefined) {
      return {
        success: false,
        error: new Error(`No forge secret found for project ${project.id}`),
      };
    }

    const credentials: ForgeGitCredentials = {
      forgeType: project.forgeType,
      token: secret,
    };

    const checkoutResult = await this.gitService.checkoutRepository({
      repositoryUrl: project.repositoryUrl,
      targetDirectory: repositoryPath,
      branch: `tasks/task-${task.id}-${runId}` as GitBranch,
      credentials,
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
    fs.writeFileSync(taskFilePath, formatTaskFile(task));

    const harnessId = await this.harnessConfig.resolveHarnessId(
      task.id,
      project.id,
      project.workspaceId,
    );
    if (!this.harnessAuthService.isAvailable(harnessId)) {
      return {
        success: false,
        error: new Error(
          `Agent harness "${harnessId}" is not available (API key not configured).`,
        ),
      };
    }
    const harness = this.harnesses.find((h) => h.id === harnessId);
    if (harness === undefined) {
      return {
        success: false,
        error: new Error(`Harness "${harnessId}" is not registered`),
      };
    }

    const credential = this.harnessAuthService.getCredential(harnessId);
    const preparation = harness.prepare({
      projectId: project.id,
      taskId: task.id,
      mcpServerUrl: MCP_SERVER_URL,
      credentials: credential,
    });

    const repository = checkoutResult.value;
    const harnessDir = AbsoluteFilePath.joinPath(
      taskTempDirectory,
      "harness",
    ) as AbsoluteFilePath;
    fs.mkdirSync(harnessDir, { recursive: true });

    const volumes: {
      hostPath: AbsoluteFilePath;
      containerPath: string;
      mode?: "ro" | "rw";
    }[] = [
      { hostPath: repository.path, containerPath: "/code" },
      { hostPath: taskFilePath, containerPath: "/task.txt" },
    ];

    for (let i = 0; i < preparation.files.length; i++) {
      const file = preparation.files[i];
      const slug = path.basename(file.containerPath) || `file-${i}`;
      const hostPath = AbsoluteFilePath.joinPath(
        harnessDir,
        `harness-${i}-${slug}`,
      ) as AbsoluteFilePath;
      fs.writeFileSync(hostPath, file.contents);
      volumes.push({
        hostPath,
        containerPath: file.containerPath,
        mode: file.mode,
      });
    }

    const harnessSetupContent =
      preparation.setupCommands.length > 0
        ? `set -e\n${preparation.setupCommands.join("\n")}\n`
        : "";
    const harnessSetupPath = AbsoluteFilePath.joinPath(
      taskTempDirectory,
      "harness-setup.sh",
    ) as AbsoluteFilePath;
    fs.writeFileSync(harnessSetupPath, harnessSetupContent);
    volumes.push({
      hostPath: harnessSetupPath,
      containerPath: "/harness-setup.sh",
    });

    const env: Record<string, string> = {
      AGENT_RUN_COMMAND: preparation.runCommand,
      ...preparation.env,
    };

    const sandbox = await this.sandboxService.createNewSandbox({
      volumes,
      env,
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

      const completedTask = await this.taskQueue.completeTask(task.id);
      if (completedTask === undefined) {
        return {
          success: false,
          error: new Error(
            `Failed to complete task ${task.id}: task not found`,
          ),
        };
      } else {
        console.info("Marked task as completed", {
          taskId: task.id,
          task: completedTask,
        });
      }
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
