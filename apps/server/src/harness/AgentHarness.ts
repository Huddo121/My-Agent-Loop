import type { AgentHarnessId, ProjectId, TaskId } from "@mono/api";
import type { ProtectedString } from "../utils/ProtectedString";

/**
 * Context passed to harness.prepare() containing all information needed to
 * prepare a harness for execution in the sandbox.
 */
export interface HarnessPreparationContext {
  projectId: ProjectId;
  taskId: TaskId;
  mcpServerUrl: string;
  credentials: ProtectedString | undefined;
  modelId: string | null;
}

/**
 * A file to be written to the sandbox before harness execution.
 *
 * OWNERSHIP: The server (WorkflowExecutionService) is responsible for writing
 * these files to the host filesystem and mounting them into the container.
 * The driver does not create or manage these files.
 */
export interface HarnessFile {
  containerPath: string;
  contents: string;
  mode?: "ro" | "rw";
}

/**
 * Result of harness preparation, containing everything needed to execute
 * the harness in the sandbox.
 *
 * ## Server/Lifecycle Responsibilities (what runs before the driver):
 * - Writing HarnessFile[] contents to the host and mounting into container
 * - Creating the task file at /task.txt (server responsibility)
 * - Running setupCommands via harness-setup.sh in lifecycle.sh
 * - Setting up environment variables
 *
 * ## Driver Responsibilities (what the driver owns):
 * - Executing the runCommand (the concrete harness command)
 * - Forwarding stdout/stderr to the host API
 * - Sending lifecycle events (harness-starting, harness-exited)
 * - Exiting with the harness result
 *
 * ## Task File Contract:
 * The task file is created by the server at /task.txt before the driver starts.
 * All runCommand values should reference this file. The driver does not create,
 * read, or manage the task file - it only executes the provided runCommand.
 */
export interface AgentHarnessPreparation {
  /**
   * Files to write to the sandbox. The server writes these to the host
   * filesystem and mounts them into the container before the driver starts.
   */
  files: HarnessFile[];
  /**
   * Shell commands to run before the harness executes. These run via
   * harness-setup.sh in lifecycle.sh, before the driver starts.
   * Common use: MCP server configuration (e.g., `claude mcp add ...`).
   */
  setupCommands: string[];
  /**
   * The concrete command for the driver to execute. This is passed to the
   * driver as --harness-command. The driver spawns this command and forwards
   * its output to the host API.
   *
   * NOTE: This command should reference /task.txt which is created by the
   * server before the driver starts. The driver does not create or manage
   * the task file.
   */
  runCommand: string;
  /**
   * Environment variables to set in the container. These are passed to the
   * sandbox creation and available to both lifecycle.sh and the driver.
   */
  env?: Record<string, string>;
}

export type HarnessModel = {
  readonly id: string;
  readonly displayName: string;
};

export interface AgentHarness {
  readonly id: AgentHarnessId;
  readonly displayName: string;
  readonly models: readonly HarnessModel[];
  prepare(context: HarnessPreparationContext): AgentHarnessPreparation;
}
