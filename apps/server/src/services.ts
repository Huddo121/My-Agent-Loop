import Dockerode from "dockerode";
import { type Database, db } from "./db";
import { env } from "./env";
import type { RelativeFilePath } from "./file-system/FilePath";
import { LocalFileSystemService } from "./file-system/FileSystemService";
import {
  DefaultForgeSecretRepository,
  type ForgeSecretRepository,
} from "./forge-secrets";
import { type GitService, SimpleGitService } from "./git/GitService";
import type { AgentHarness } from "./harness";
import {
  type AgentHarnessConfigRepository,
  DatabaseAgentHarnessConfigRepository,
} from "./harness/AgentHarnessConfigRepository";
import { ClaudeCodeHarness } from "./harness/ClaudeCodeHarness";
import { CodexCliHarness } from "./harness/CodexCliHarness";
import { CursorCliHarness } from "./harness/CursorCliHarness";
import {
  EnvHarnessAuthService,
  type HarnessAuthService,
} from "./harness/HarnessAuthService";
import { OpenCodeHarness } from "./harness/OpenCodeHarness";
import { DatabaseProjectService } from "./projects/DatabaseProjectService";
import type { ProjectsService } from "./projects/ProjectsService";
import { DatabaseRunsService, type RunsService } from "./runs/RunsService";
import { DockerLoggingService } from "./sandbox/DockerLoggingService";
import {
  DockerSandboxService,
  type SandboxService,
} from "./sandbox/SandboxService";
import { DatabaseTaskQueue, type TaskQueue } from "./task-queue";
import {
  DefaultEncryptionService,
  type EncryptionService,
} from "./utils/EncryptionService";
import { BackgroundWorkflowProcessor } from "./workflow/BackgroundWorkflowProcessor";
import { WorkflowExecutionService } from "./workflow/WorkflowExecutionService";
import {
  DatabaseWorkflowManager,
  type WorkflowManager,
} from "./workflow/WorkflowManager";
import { WorkflowMessengerService } from "./workflow/WorkflowMessengerService";
import { WorkflowQueues } from "./workflow/workflow-queues";
import { DatabaseWorkspacesService } from "./workspaces/DatabaseWorkspacesService";
import type { WorkspacesService } from "./workspaces/WorkspacesService";

export interface Services {
  db: Database;
  taskQueue: TaskQueue;
  sandboxService: SandboxService;
  gitService: GitService;
  workflowQueues: WorkflowQueues;
  workflowManager: WorkflowManager;
  workflowExecutionService: WorkflowExecutionService;
  backgroundWorkflowProcessor: BackgroundWorkflowProcessor;
  projectsService: ProjectsService;
  workspacesService: WorkspacesService;
  runsService: RunsService;
  encryptionService: EncryptionService;
  forgeSecretRepository: ForgeSecretRepository;
  agentHarnessConfigRepository: AgentHarnessConfigRepository;
  harnessAuthService: HarnessAuthService;
  harnesses: readonly AgentHarness[];
}

const encryptionService = new DefaultEncryptionService(
  env.FORGE_ENCRYPTION_KEY,
);
const forgeSecretRepository = new DefaultForgeSecretRepository(
  encryptionService,
);

const gitService = new SimpleGitService();
const sandboxService = new DockerSandboxService(
  new Dockerode(),
  new DockerLoggingService(console),
);

const taskQueue = new DatabaseTaskQueue();
const agentHarnessConfigRepository = new DatabaseAgentHarnessConfigRepository();
const harnessAuthService = new EnvHarnessAuthService({
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
  CURSOR_API_KEY: env.CURSOR_API_KEY,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
});
const workspacesService = new DatabaseWorkspacesService(
  agentHarnessConfigRepository,
);
const projectsService = new DatabaseProjectService(
  agentHarnessConfigRepository,
);

const fileSystemService = new LocalFileSystemService(
  "./.devloop/runs" as RelativeFilePath,
);

const runsService = new DatabaseRunsService();

const workflowQueues = new WorkflowQueues(env.REDIS_HOST);

const harnesses: readonly AgentHarness[] = [
  new OpenCodeHarness(),
  new ClaudeCodeHarness(),
  new CursorCliHarness(),
  new CodexCliHarness(),
];

const workflowMessengerService = new WorkflowMessengerService();

const workflowManager = new DatabaseWorkflowManager(
  workflowMessengerService,
  taskQueue,
  runsService,
  projectsService,
  workflowQueues,
  db,
);

const workflowExecutionService = new WorkflowExecutionService(
  taskQueue,
  gitService,
  sandboxService,
  fileSystemService,
  harnesses,
  agentHarnessConfigRepository,
  harnessAuthService,
  forgeSecretRepository,
);

const backgroundWorkflowProcessor = new BackgroundWorkflowProcessor(
  workflowQueues,
  workflowMessengerService,
  taskQueue,
  runsService,
  projectsService,
  workflowExecutionService,
  gitService,
  db,
  forgeSecretRepository,
);

export const services: Services = {
  db,
  taskQueue,
  sandboxService,
  gitService,
  workflowManager,
  workflowExecutionService,
  projectsService,
  workspacesService,
  runsService,
  encryptionService,
  forgeSecretRepository,
  agentHarnessConfigRepository,
  harnessAuthService,
  harnesses,
  workflowQueues,
  backgroundWorkflowProcessor,
};
