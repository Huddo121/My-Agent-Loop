import type { AgentHarnessId, ProjectId, TaskId } from "@mono/api";
import type { ProtectedString } from "../utils/ProtectedString";

export interface HarnessPreparationContext {
  projectId: ProjectId;
  taskId: TaskId;
  mcpServerUrl: string;
  credentials: ProtectedString | undefined;
  modelId: string | null;
}

export interface HarnessFile {
  containerPath: string;
  contents: string;
  mode?: "ro" | "rw";
}

export interface AgentHarnessPreparation {
  files: HarnessFile[];
  setupCommands: string[];
  runCommand: string;
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
