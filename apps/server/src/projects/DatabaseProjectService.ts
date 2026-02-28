import type {
  AgentHarnessId,
  ProjectId,
  ProjectShortCode,
  WorkspaceId,
} from "@mono/api";
import { and, asc, eq } from "drizzle-orm";
import { projectsTable } from "../db/schema";
import type { AgentHarnessConfigRepository } from "../harness/AgentHarnessConfigRepository";
import { getTransaction } from "../utils/transaction-context";
import type {
  CreateProject,
  Project,
  ProjectsService,
  QueueState,
  UpdateProject,
} from "./ProjectsService";

const DEFAULT_HARNESS_ID: AgentHarnessId = "opencode";

function toProject(
  row: typeof projectsTable.$inferSelect,
  agentHarnessId: AgentHarnessId | null,
  resolvedAgentHarnessId: AgentHarnessId,
): Project {
  return {
    id: row.id as ProjectId,
    workspaceId: row.workspaceId as WorkspaceId,
    name: row.name,
    shortCode: row.shortCode as ProjectShortCode,
    repositoryUrl: row.repositoryUrl,
    workflowConfiguration: row.workflowConfiguration,
    queueState: row.queueState,
    forgeType: row.forgeType,
    forgeBaseUrl: row.forgeBaseUrl,
    agentHarnessId,
    resolvedAgentHarnessId,
  };
}

export class DatabaseProjectService implements ProjectsService {
  constructor(private readonly harnessConfig: AgentHarnessConfigRepository) {}

  async getAllProjects(workspaceId: WorkspaceId): Promise<Project[]> {
    const tx = getTransaction();
    const rows = await tx
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.workspaceId, workspaceId))
      .orderBy(asc(projectsTable.id));
    const workspaceConfig =
      await this.harnessConfig.getWorkspaceConfig(workspaceId);
    const result: Project[] = [];
    for (const row of rows) {
      const id = row.id as ProjectId;
      const agentHarnessId = await this.harnessConfig.getProjectConfig(id);
      const resolvedAgentHarnessId =
        agentHarnessId ?? workspaceConfig ?? DEFAULT_HARNESS_ID;
      result.push(toProject(row, agentHarnessId, resolvedAgentHarnessId));
    }
    return result;
  }

  async getProject(projectId: ProjectId): Promise<Project | undefined> {
    const tx = getTransaction();
    const [row] = await tx
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));

    if (!row) {
      return undefined;
    }

    const agentHarnessId = await this.harnessConfig.getProjectConfig(projectId);
    const workspaceConfig = await this.harnessConfig.getWorkspaceConfig(
      row.workspaceId as WorkspaceId,
    );
    const resolvedAgentHarnessId =
      agentHarnessId ?? workspaceConfig ?? DEFAULT_HARNESS_ID;
    return toProject(row, agentHarnessId, resolvedAgentHarnessId);
  }

  async createProject(project: CreateProject): Promise<Project> {
    const tx = getTransaction();
    const [newProject] = await tx
      .insert(projectsTable)
      .values({
        workspaceId: project.workspaceId,
        name: project.name,
        shortCode: project.shortCode,
        repositoryUrl: project.repositoryUrl,
        workflowConfiguration: project.workflowConfiguration,
        forgeType: project.forgeType,
        forgeBaseUrl: project.forgeBaseUrl,
      })
      .returning();

    if (
      project.agentHarnessId !== undefined &&
      project.agentHarnessId !== null
    ) {
      await this.harnessConfig.setProjectConfig(
        newProject.id as ProjectId,
        project.agentHarnessId,
      );
    }
    const created = await this.getProject(newProject.id as ProjectId);
    if (!created) throw new Error("Project not found after create");
    return created;
  }

  async getProjectByShortCode(
    workspaceId: WorkspaceId,
    shortCode: ProjectShortCode,
  ): Promise<Project | undefined> {
    const tx = getTransaction();
    const [row] = await tx
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.workspaceId, workspaceId),
          eq(projectsTable.shortCode, shortCode),
        ),
      );

    if (!row) {
      return undefined;
    }

    const id = row.id as ProjectId;
    const agentHarnessId = await this.harnessConfig.getProjectConfig(id);
    const workspaceConfig =
      await this.harnessConfig.getWorkspaceConfig(workspaceId);
    const resolvedAgentHarnessId =
      agentHarnessId ?? workspaceConfig ?? DEFAULT_HARNESS_ID;
    return toProject(row, agentHarnessId, resolvedAgentHarnessId);
  }

  async updateProject(
    projectId: ProjectId,
    update: UpdateProject,
  ): Promise<Project | undefined> {
    const tx = getTransaction();
    const { agentHarnessId, ...tableUpdate } = update;
    const tableKeys = [
      "workspaceId",
      "name",
      "shortCode",
      "repositoryUrl",
      "workflowConfiguration",
      "forgeType",
      "forgeBaseUrl",
    ] as const;
    const setPayload: Record<string, unknown> = {};
    for (const key of tableKeys) {
      if (key in tableUpdate && tableUpdate[key] !== undefined) {
        setPayload[key] = tableUpdate[key];
      }
    }
    if (Object.keys(setPayload).length > 0) {
      await tx
        .update(projectsTable)
        .set(setPayload as typeof tableUpdate)
        .where(eq(projectsTable.id, projectId));
    }
    if (agentHarnessId !== undefined) {
      await this.harnessConfig.setProjectConfig(projectId, agentHarnessId);
    }
    return this.getProject(projectId);
  }

  async updateProjectQueueState(
    projectId: ProjectId,
    queueState: QueueState,
  ): Promise<Project | undefined> {
    const tx = getTransaction();
    const [updatedProject] = await tx
      .update(projectsTable)
      .set({ queueState })
      .where(eq(projectsTable.id, projectId))
      .returning();

    if (!updatedProject) {
      return undefined;
    }

    return this.getProject(projectId);
  }

  async deleteProject(projectId: ProjectId): Promise<Project | undefined> {
    const project = await this.getProject(projectId);
    if (!project) return undefined;
    const tx = getTransaction();
    await tx.delete(projectsTable).where(eq(projectsTable.id, projectId));
    return project;
  }
}
