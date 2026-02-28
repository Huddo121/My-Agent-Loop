import type { AgentHarnessId, ProjectId, TaskId } from "@mono/api";
import type { ProtectedString } from "../utils/ProtectedString";

export interface HarnessPreparationContext {
  projectId: ProjectId;
  taskId: TaskId;
  mcpServerUrl: string;
  credentials: ProtectedString | undefined;
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

export interface AgentHarness {
  readonly id: AgentHarnessId;
  readonly displayName: string;
  prepare(context: HarnessPreparationContext): AgentHarnessPreparation;
}

export class HarnessRegistry {
  private readonly harnesses = new Map<AgentHarnessId, AgentHarness>();

  register(harness: AgentHarness): void {
    this.harnesses.set(harness.id, harness);
  }

  get(id: AgentHarnessId): AgentHarness | undefined {
    return this.harnesses.get(id);
  }

  getAll(): AgentHarness[] {
    return Array.from(this.harnesses.values());
  }
}
