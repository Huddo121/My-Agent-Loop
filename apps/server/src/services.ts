import Dockerode from "dockerode";
import { type Database, db } from "./db";
import type { RelativeFilePath } from "./file-system/FilePath";
import { LocalFileSystemService } from "./file-system/FileSystemService";
import { type GitService, SimpleGitService } from "./git/GitService";
import { DatabaseProjectService } from "./projects/DatabaseProjectService";
import type { ProjectsService } from "./projects/ProjectsService";
import { DockerLoggingService } from "./sandbox/DockerLoggingService";
import {
  DockerSandboxService,
  type SandboxService,
} from "./sandbox/SandboxService";
import { DatabaseTaskQueue, type TaskQueue } from "./task-queue";
import { WorkflowService } from "./workflow/WorkflowService";

export interface Services {
  db: Database;
  taskQueue: TaskQueue;
  sandboxService: SandboxService;
  gitService: GitService;
  workflowService: WorkflowService;
  projectsService: ProjectsService;
}

const gitService = new SimpleGitService();
const sandboxService = new DockerSandboxService(
  new Dockerode(),
  new DockerLoggingService(console),
);

const taskQueue = new DatabaseTaskQueue();
const projectsService = new DatabaseProjectService();

const fileSystemService = new LocalFileSystemService(
  "./.devloop/runs" as RelativeFilePath,
);

const workflowService = new WorkflowService(
  taskQueue,
  projectsService,
  gitService,
  sandboxService,
  fileSystemService,
);

export const services: Services = {
  db,
  taskQueue,
  sandboxService,
  gitService,
  workflowService,
  projectsService,
};
