import type { AgentHarnessId, WorkspaceId } from "@mono/api";
import { asc, eq } from "drizzle-orm";
import { workspacesTable } from "../db/schema";
import type { AgentHarnessConfigRepository } from "../harness/AgentHarnessConfigRepository";
import { getTransaction } from "../utils/transaction-context";
import type { CreateWorkspace, UpdateWorkspace, Workspace } from "./Workspace";
import type { WorkspacesService } from "./WorkspacesService";

const DEFAULT_HARNESS_ID: AgentHarnessId = "opencode";

function toWorkspace(
  row: typeof workspacesTable.$inferSelect,
  agentHarnessId: AgentHarnessId | null,
): Workspace {
  return {
    id: row.id as WorkspaceId,
    name: row.name,
    createdAt: row.createdAt,
    agentHarnessId,
    resolvedAgentHarnessId: agentHarnessId ?? DEFAULT_HARNESS_ID,
  };
}

export class DatabaseWorkspacesService implements WorkspacesService {
  constructor(private readonly harnessConfig: AgentHarnessConfigRepository) {}

  async getAllWorkspaces(): Promise<Workspace[]> {
    const tx = getTransaction();
    const rows = await tx
      .select()
      .from(workspacesTable)
      .orderBy(asc(workspacesTable.id));
    const result: Workspace[] = [];
    for (const row of rows) {
      const config = await this.harnessConfig.getWorkspaceConfig(
        row.id as WorkspaceId,
      );
      result.push(toWorkspace(row, config));
    }
    return result;
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | undefined> {
    const tx = getTransaction();
    const [row] = await tx
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, id));
    if (!row) return undefined;
    const config = await this.harnessConfig.getWorkspaceConfig(id);
    return toWorkspace(row, config);
  }

  async createWorkspace(workspace: CreateWorkspace): Promise<Workspace> {
    const tx = getTransaction();
    const [row] = await tx
      .insert(workspacesTable)
      .values({ name: workspace.name })
      .returning();
    return toWorkspace(row, null);
  }

  async updateWorkspace(
    id: WorkspaceId,
    update: UpdateWorkspace,
  ): Promise<Workspace | undefined> {
    const tx = getTransaction();
    const existing = await this.getWorkspace(id);
    if (!existing) return undefined;

    if (update.name !== undefined) {
      await tx
        .update(workspacesTable)
        .set({ name: update.name })
        .where(eq(workspacesTable.id, id));
    }
    if (update.agentHarnessId !== undefined) {
      await this.harnessConfig.setWorkspaceConfig(id, update.agentHarnessId);
    }

    return this.getWorkspace(id);
  }
}
