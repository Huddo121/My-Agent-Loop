import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type { DriverRunTokenStore } from "../driver-api/DriverRunTokenStore";
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
const DRIVER_HOST_API_BASE_URL = "http://host.docker.internal:3050";

const formatTaskFile = (task: Task): string => {
  let content = `# ${task.title}\n\n${task.description}\n`;

  if (task.subtasks.length > 0) {
    content += "\n## Subtasks\n\n";
    const subtasksYaml = task.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      ...(s.description ? { description: s.description } : {}),
      status: s.state,
    }));
    content += stringify(subtasksYaml);
  }

  return content;
};

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'"'"'`)}'`;

/**
 * Builds the CLI arguments for the driver binary.
 *
 * The harness command is produced by the harness's prepare() method and represents
 * the concrete command the driver should execute. This is the "contract" between
 * server and driver:
 * - Server: resolves harness, calls prepare(), produces runCommand
 * - Driver: receives runCommand via --harness-command, executes it, forwards logs
 *
 * The driver does not create the task file - that is a server responsibility.
 * The driver simply executes the provided harness command.
 */
const buildDriverCliArgs = (options: {
  runId: RunId;
  taskId: Task["id"];
  hostApiBaseUrl: string;
  driverToken: string;
  harnessCommand: string;
}): string =>
  [
    ["--run-id", options.runId],
    ["--task-id", options.taskId],
    ["--host-api-base-url", options.hostApiBaseUrl],
    ["--driver-token", options.driverToken],
    ["--harness-command", options.harnessCommand],
  ]
    .map(([flag, value]) => `${flag} ${shellQuote(value)}`)
    .join(" ");

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
    private readonly driverRunTokenStore: DriverRunTokenStore,
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
    driverToken: string,
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

    // Create the task file at /task.txt in the container.
    // This is a SERVER responsibility - the driver does not create or manage the task file.
    // The driver only executes the harness command which references this file.
    const taskFilePath = AbsoluteFilePath.joinPath(
      taskTempDirectory,
      "task.txt",
    );
    fs.writeFileSync(taskFilePath, formatTaskFile(task));

    const { harnessId, modelId } =
      await this.harnessConfig.resolveHarnessConfig(
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
      modelId,
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

    // Driver binary path - defaults to /usr/local/bin/driver (set during Docker build)
    const driverBinaryPath =
      process.env.MAL_DRIVER_BINARY_PATH ?? "/usr/local/bin/driver";

    const env: Record<string, string> = {
      MAL_DRIVER_BINARY_PATH: driverBinaryPath,
      MAL_DRIVER_CLI_ARGS: buildDriverCliArgs({
        runId,
        taskId: task.id,
        hostApiBaseUrl: DRIVER_HOST_API_BASE_URL,
        driverToken,
        harnessCommand: preparation.runCommand,
      }),
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
    const driverToken = randomBytes(32).toString("base64url");
    const prepareResult = await this.prepare(project, runId, task, driverToken);
    if (prepareResult.success === false) {
      return { success: false, error: prepareResult.error };
    }
    const { repository, sandbox } = prepareResult.value;

    this.driverRunTokenStore.setToken(runId, driverToken);

    try {
      const startSandboxResult = await this.sandboxService.startSandbox(
        sandbox.id,
      );
      if (startSandboxResult.success === false) {
        return {
          success: false,
          error: new Error(
            `Failed to start sandbox ${sandbox.id}: ${startSandboxResult.error.reason}`,
          ),
        };
      }

      const oneHourInMs = 3600000;
      const result = await timeout(
        this.sandboxService.waitForSandboxToFinish(sandbox.id),
        oneHourInMs,
      ).catch(
        () => ({ success: false, error: { reason: "timeout" } }) as const,
      );

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
    } finally {
      this.driverRunTokenStore.clearToken(runId);
    }
  }
}
