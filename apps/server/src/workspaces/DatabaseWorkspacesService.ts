import type { WorkspaceId } from "@mono/api";
import { asc, eq } from "drizzle-orm";
import type { UserId } from "../auth/UserId";
import type { WorkspaceMembershipsService } from "../auth/WorkspaceMembershipsService";
import { workspaceMembershipsTable, workspacesTable } from "../db/schema";
import type {
  AgentHarnessConfigRepository,
  ScopedHarnessConfig,
} from "../harness/AgentHarnessConfigRepository";
import { getTransaction } from "../utils/transaction-context";
import type { CreateWorkspace, UpdateWorkspace, Workspace } from "./Workspace";
import type { WorkspacesService } from "./WorkspacesService";

function toWorkspace(
  row: typeof workspacesTable.$inferSelect,
  config: ScopedHarnessConfig | null,
): Workspace {
  return {
    id: row.id as WorkspaceId,
    name: row.name,
    createdAt: row.createdAt,
    agentConfig: config,
  };
}

export class DatabaseWorkspacesService implements WorkspacesService {
  constructor(
    private readonly harnessConfig: AgentHarnessConfigRepository,
    private readonly memberships: WorkspaceMembershipsService,
  ) {}

  async getAllWorkspacesForUser(userId: UserId): Promise<Workspace[]> {
    const tx = getTransaction();
    const rows = await tx
      .select()
      .from(workspacesTable)
      .innerJoin(
        workspaceMembershipsTable,
        eq(workspaceMembershipsTable.workspaceId, workspacesTable.id),
      )
      .where(eq(workspaceMembershipsTable.userId, userId))
      .orderBy(asc(workspacesTable.id));
    const result: Workspace[] = [];
    for (const { workspaces } of rows) {
      const config = await this.harnessConfig.getWorkspaceConfig(workspaces.id);
      result.push(toWorkspace(workspaces, config));
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

  async createWorkspaceForUser(
    userId: UserId,
    workspace: CreateWorkspace,
  ): Promise<Workspace> {
    const tx = getTransaction();
    const [row] = await tx
      .insert(workspacesTable)
      .values({ name: workspace.name })
      .returning();
    await this.memberships.addMembership(userId, row.id);
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
    if (update.agentConfig !== undefined) {
      await this.harnessConfig.setWorkspaceConfig(
        id,
        update.agentConfig ?? null,
      );
    }

    return this.getWorkspace(id);
  }
}
