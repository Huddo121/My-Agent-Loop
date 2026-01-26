import type { ProjectId, ProjectShortCode } from "@mono/api";
import { asc, eq } from "drizzle-orm";
import { projectsTable } from "../db/schema";
import { getTransaction } from "../utils/transaction-context";
import type { Project, ProjectsService } from "./ProjectsService";

const fromProjectEntity = (
  project: typeof projectsTable.$inferSelect,
): Project => {
  return {
    id: project.id as ProjectId,
    name: project.name,
    shortCode: project.shortCode as ProjectShortCode,
    repositoryUrl: project.repositoryUrl,
  };
};

export class DatabaseProjectService implements ProjectsService {
  async getAllProjects(): Promise<Project[]> {
    const tx = getTransaction();
    const projects = await tx
      .select()
      .from(projectsTable)
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

  async createProject(project: Project): Promise<Project> {
    const tx = getTransaction();
    const [newProject] = await tx
      .insert(projectsTable)
      .values({
        name: project.name,
        shortCode: project.shortCode,
        repositoryUrl: project.repositoryUrl,
      })
      .returning();

    return fromProjectEntity(newProject);
  }

  async getProjectByShortCode(
    shortCode: ProjectShortCode,
  ): Promise<Project | undefined> {
    const tx = getTransaction();
    const [project] = await tx
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.shortCode, shortCode));

    if (!project) {
      return undefined;
    }

    return fromProjectEntity(project);
  }

  async updateProject(project: Project): Promise<Project | undefined> {
    const tx = getTransaction();
    const [updatedProject] = await tx
      .update(projectsTable)
      .set({
        name: project.name,
        shortCode: project.shortCode,
        repositoryUrl: project.repositoryUrl,
      })
      .where(eq(projectsTable.id, project.id))
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
