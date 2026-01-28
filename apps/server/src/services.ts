import Dockerode from "dockerode";
import { type Database, db } from "./db";
import { env } from "./env";
import type { RelativeFilePath } from "./file-system/FilePath";
import { LocalFileSystemService } from "./file-system/FileSystemService";
import { type GitService, SimpleGitService } from "./git/GitService";
import { DatabaseProjectService } from "./projects/DatabaseProjectService";
import type { ProjectsService } from "./projects/ProjectsService";
import { ModelProviderService } from "./providers/ModelProviderServices";
import { DatabaseRunsService } from "./runs/RunsService";
import { DockerLoggingService } from "./sandbox/DockerLoggingService";
import {
  DockerSandboxService,
  type SandboxService,
} from "./sandbox/SandboxService";
import { DatabaseTaskQueue, type TaskQueue } from "./task-queue";
import { BackgroundWorkflowProcessor } from "./workflow/BackgroundWorkflowProcessor";
import { OpenCodeConfigService } from "./workflow/OpenCodeConfigService";
import { WorkflowExecutionService } from "./workflow/WorkflowExecutionService";
import { WorkflowQueues } from "./workflow/workflow-queues";

export interface Services {
  db: Database;
  taskQueue: TaskQueue;
  sandboxService: SandboxService;
  gitService: GitService;
  workflowQueues: WorkflowQueues;
  workflowExecutionService: WorkflowExecutionService;
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

const modelProviderService = new ModelProviderService({
  openrouter: env.OPENROUTER_API_KEY,
});
const openCodeConfigService = new OpenCodeConfigService(modelProviderService);

const workflowExecutionService = new WorkflowExecutionService(
  taskQueue,
  gitService,
  sandboxService,
  fileSystemService,
  openCodeConfigService,
);

const backgroundWorkflowProcessor = new BackgroundWorkflowProcessor(
  workflowQueues,
  taskQueue,
  runsService,
  projectsService,
  workflowExecutionService,
  gitService,
  db,
);

export const services: Services = {
  db,
  taskQueue,
  sandboxService,
  gitService,
  workflowExecutionService,
  projectsService,
  workflowQueues,
  backgroundWorkflowProcessor,
};
