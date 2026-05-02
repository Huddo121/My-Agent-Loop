import type { ProjectId, ProjectShortCode, WorkspaceId } from "@mono/api";
import type {
  CreateProject,
  Project,
  ProjectsService,
  QueueState,
  UpdateProject,
} from "../projects/ProjectsService";

/**
 * In-memory project store for handler and workflow tests.
 */
export class FakeProjectsService implements ProjectsService {
  private readonly projects = new Map<ProjectId, Project>();

  seed(project: Project): void {
    this.projects.set(project.id, project);
  }

  async getAllProjects(workspaceId: WorkspaceId): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (p) => p.workspaceId === workspaceId,
    );
  }

  async getProject(projectId: ProjectId): Promise<Project | undefined> {
    return this.projects.get(projectId);
  }

  async getProjectByShortCode(
    workspaceId: WorkspaceId,
    shortCode: ProjectShortCode,
  ): Promise<Project | undefined> {
    return Array.from(this.projects.values()).find(
      (p) => p.workspaceId === workspaceId && p.shortCode === shortCode,
    );
  }

  async createProject(project: CreateProject): Promise<Project> {
    const id = `project-${this.projects.size + 1}` as ProjectId;
    const full: Project = {
      ...project,
      id,
      queueState: "idle",
    };
    this.projects.set(id, full);
    return full;
  }

  async updateProject(
    projectId: ProjectId,
    project: UpdateProject,
  ): Promise<Project | undefined> {
    const current = this.projects.get(projectId);
    if (current === undefined) return undefined;
    const next = { ...current, ...project };
    this.projects.set(projectId, next);
    return next;
  }

  async updateProjectQueueState(
    projectId: ProjectId,
    queueState: QueueState,
  ): Promise<Project | undefined> {
    const current = this.projects.get(projectId);
    if (current === undefined) return undefined;
    const next = { ...current, queueState };
    this.projects.set(projectId, next);
    return next;
  }

  async deleteProject(projectId: ProjectId): Promise<Project | undefined> {
    const p = this.projects.get(projectId);
    if (p === undefined) return undefined;
    this.projects.delete(projectId);
    return p;
  }
}
