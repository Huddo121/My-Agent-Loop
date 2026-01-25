import Dockerode from "dockerode";
import { type Database, db } from "./db";
import { env } from "./env";
import type { RelativeFilePath } from "./file-system/FilePath";
import { LocalFileSystemService } from "./file-system/FileSystemService";
import { type GitService, SimpleGitService } from "./git/GitService";
import { DatabaseProjectService } from "./projects/DatabaseProjectService";
import type { ProjectsService } from "./projects/ProjectsService";
import { DatabaseRunsService } from "./runs/RunsService";
import { DockerLoggingService } from "./sandbox/DockerLoggingService";
import {
  DockerSandboxService,
  type SandboxService,
} from "./sandbox/SandboxService";
import { DatabaseTaskQueue, type TaskQueue } from "./task-queue";
import { BackgroundWorkflowProcessor } from "./workflow/BackgroundWorkflowProcessor";
import { WorkflowService } from "./workflow/WorkflowService";
import { WorkflowQueues } from "./workflow/workflow-queues";

export interface Services {
  db: Database;
  taskQueue: TaskQueue;
  sandboxService: SandboxService;
  gitService: GitService;
  workflowQueues: WorkflowQueues;
  workflowService: WorkflowService;
  backgroundWorkflowProcessor: BackgroundWorkflowProcessor;
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

const runsService = new DatabaseRunsService();

const workflowQueues = new WorkflowQueues(env.REDIS_HOST);
const backgroundWorkflowProcessor = new BackgroundWorkflowProcessor(
  workflowQueues,
  taskQueue,
  runsService,
  db,
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
  workflowQueues,
  backgroundWorkflowProcessor,
};
