import type { ProjectId, ProjectShortCode, WorkspaceId } from "@mono/api";
import { and, asc, eq } from "drizzle-orm";
import { projectsTable } from "../db/schema";
import { getTransaction } from "../utils/transaction-context";
import type {
  CreateProject,
  Project,
  ProjectsService,
  QueueState,
  UpdateProject,
} from "./ProjectsService";

const fromProjectEntity = (
  project: typeof projectsTable.$inferSelect,
): Project => {
  return {
    id: project.id as ProjectId,
    workspaceId: project.workspaceId as WorkspaceId,
    name: project.name,
    shortCode: project.shortCode as ProjectShortCode,
    repositoryUrl: project.repositoryUrl,
    workflowConfiguration: project.workflowConfiguration,
    queueState: project.queueState,
    forgeType: project.forgeType,
    forgeBaseUrl: project.forgeBaseUrl,
  };
};

export class DatabaseProjectService implements ProjectsService {
  async getAllProjects(workspaceId: WorkspaceId): Promise<Project[]> {
    const tx = getTransaction();
    const projects = await tx
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.workspaceId, workspaceId))
      .orderBy(asc(projectsTable.id));
    return projects.map(fromProjectEntity);
  }

  async getProject(projectId: ProjectId): Promise<Project | undefined> {
    const tx = getTransaction();
    const [project] = await tx
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));

    if (!project) {
      return undefined;
    }

    return fromProjectEntity(project);
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

    return fromProjectEntity(newProject);
  }

  async getProjectByShortCode(
    workspaceId: WorkspaceId,
    shortCode: ProjectShortCode,
  ): Promise<Project | undefined> {
    const tx = getTransaction();
    const [project] = await tx
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.workspaceId, workspaceId),
          eq(projectsTable.shortCode, shortCode),
        ),
      );

    if (!project) {
      return undefined;
    }

    return fromProjectEntity(project);
  }

  async updateProject(
    projectId: ProjectId,
    project: UpdateProject,
  ): Promise<Project | undefined> {
    const tx = getTransaction();

    const [updatedProject] = await tx
      .update(projectsTable)
      .set({ ...project })
      .where(eq(projectsTable.id, projectId))
      .returning();

    if (!updatedProject) {
      return undefined;
    }

    return fromProjectEntity(updatedProject);
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

    return fromProjectEntity(updatedProject);
  }

  async deleteProject(projectId: ProjectId): Promise<Project | undefined> {
    const tx = getTransaction();
    const [deletedProject] = await tx
      .delete(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .returning();

    if (!deletedProject) {
      return undefined;
    }

    return fromProjectEntity(deletedProject);
  }
}
