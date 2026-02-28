import type { WorkspaceId } from "@mono/api";
import { asc, eq } from "drizzle-orm";
import { workspacesTable } from "../db/schema";
import { getTransaction } from "../utils/transaction-context";
import type { CreateWorkspace, Workspace } from "./Workspace";
import type { WorkspacesService } from "./WorkspacesService";

const fromWorkspaceEntity = (
  row: typeof workspacesTable.$inferSelect,
): Workspace => ({
  id: row.id as WorkspaceId,
  name: row.name,
  createdAt: row.createdAt,
});

export class DatabaseWorkspacesService implements WorkspacesService {
  async getAllWorkspaces(): Promise<Workspace[]> {
    const tx = getTransaction();
    const rows = await tx
      .select()
      .from(workspacesTable)
      .orderBy(asc(workspacesTable.id));
    return rows.map(fromWorkspaceEntity);
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | undefined> {
    const tx = getTransaction();
    const [row] = await tx
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.id, id));
    return row ? fromWorkspaceEntity(row) : undefined;
  }

  async createWorkspace(workspace: CreateWorkspace): Promise<Workspace> {
    const tx = getTransaction();
    const [row] = await tx
      .insert(workspacesTable)
      .values({ name: workspace.name })
      .returning();
    return fromWorkspaceEntity(row);
  }
}
