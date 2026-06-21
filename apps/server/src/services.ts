import Dockerode from "dockerode";
import {
  DatabaseWorkspaceMembershipsService,
  type WorkspaceMembershipsService,
} from "./auth/WorkspaceMembershipsService";
import { type Database, db } from "./db";
import {
  type DriverRunTokenStore,
  InMemoryDriverRunTokenStore,
} from "./driver-api/DriverRunTokenStore";
import { env } from "./env";
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
  CompositeHarnessAuthService,
  EnvHarnessAuthService,
  type HarnessAuthService,
} from "./harness/HarnessAuthService";
import { OpenCodeHarness } from "./harness/OpenCodeHarness";
import { LiveEventsService } from "./live-events";
import { ConsoleLogger, type Logger } from "./logger/Logger";
import { OpenAiCodexProvider } from "./oauth-providers";
import { DatabaseProjectService } from "./projects/DatabaseProjectService";
import type { ProjectsService } from "./projects/ProjectsService";
import { DatabaseRunsService, type RunsService } from "./runs/RunsService";
import { DockerLoggingService } from "./sandbox/DockerLoggingService";
import {
  DockerSandboxService,
  type SandboxService,
} from "./sandbox/SandboxService";
import { CloudHypervisorAdapter } from "./sandbox/vm/CloudHypervisorAdapter";
import { VfkitAdapter } from "./sandbox/vm/VfkitAdapter";
import { VmSandboxService } from "./sandbox/vm/VmSandboxService";
import {
  DatabaseSandboxTypeConfigRepository,
  type SandboxTypeConfigRepository,
} from "./sandbox-config";
import { DatabaseTaskQueue, type TaskQueue } from "./task-queue";
import {
  DefaultUserOAuthCredentialRepository,
  type UserOAuthCredentialRepository,
} from "./user-oauth-credentials";
import {
  DefaultEncryptionService,
  type EncryptionService,
} from "./utils/EncryptionService";
import { SaltedEncryptionService } from "./utils/SaltedEncryptionService";
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
  driverRunTokenStore: DriverRunTokenStore;
  sandboxService: SandboxService;
  vmSandboxService: SandboxService;
  sandboxTypeConfigRepository: SandboxTypeConfigRepository;
  gitService: GitService;
  workflowQueues: WorkflowQueues;
  workflowManager: WorkflowManager;
  workflowExecutionService: WorkflowExecutionService;
  backgroundWorkflowProcessor: BackgroundWorkflowProcessor;
  projectsService: ProjectsService;
  workspacesService: WorkspacesService;
  workspaceMembershipsService: WorkspaceMembershipsService;
  runsService: RunsService;
  encryptionService: EncryptionService;
  saltedEncryptionService: SaltedEncryptionService;
  forgeSecretRepository: ForgeSecretRepository;
  userOAuthCredentialRepository: UserOAuthCredentialRepository;
  agentHarnessConfigRepository: AgentHarnessConfigRepository;
  harnessAuthService: HarnessAuthService;
  harnesses: readonly AgentHarness[];
  logger: Logger;
  liveEventsService: LiveEventsService;
}

const encryptionService = new DefaultEncryptionService(
  env.FORGE_ENCRYPTION_KEY,
);
const saltedEncryptionService = new SaltedEncryptionService(
  env.OAUTH_CREDENTIALS_ENCRYPTION_KEY,
);
const forgeSecretRepository = new DefaultForgeSecretRepository(
  encryptionService,
);
const userOAuthCredentialRepository = new DefaultUserOAuthCredentialRepository(
  saltedEncryptionService,
);

const gitService = new SimpleGitService();
const sandboxService = new DockerSandboxService(
  new Dockerode(),
  new DockerLoggingService(console),
  env.MAL_SANDBOX_IMAGE,
);

const taskQueue = new DatabaseTaskQueue();
const driverRunTokenStore = new InMemoryDriverRunTokenStore();
const agentHarnessConfigRepository = new DatabaseAgentHarnessConfigRepository();
const workspaceMembershipsService = new DatabaseWorkspaceMembershipsService();

// Logger is defined here (ahead of the services that need it at construction time) because
// module-level const declarations are evaluated top-to-bottom.
const logger: Logger = ConsoleLogger;

const envHarnessAuthService = new EnvHarnessAuthService({
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
  CURSOR_API_KEY: env.CURSOR_API_KEY,
  OPENAI_API_KEY: env.OPENAI_API_KEY,
});
const openAiCodexProvider = new OpenAiCodexProvider();
const harnessAuthService = new CompositeHarnessAuthService(
  envHarnessAuthService,
  userOAuthCredentialRepository,
  openAiCodexProvider,
  logger,
);
const workspacesService = new DatabaseWorkspacesService(
  agentHarnessConfigRepository,
  workspaceMembershipsService,
);
const projectsService = new DatabaseProjectService(
  agentHarnessConfigRepository,
);

const fileSystemService = new LocalFileSystemService(env.MAL_RUNS_DIR);

const runsService = new DatabaseRunsService();

const workflowQueues = new WorkflowQueues(env.REDIS_HOST, env.REDIS_PORT);

const harnesses: readonly AgentHarness[] = [
  new OpenCodeHarness(),
  new ClaudeCodeHarness(),
  new CursorCliHarness(),
  new CodexCliHarness(),
];

const workflowMessengerService = new WorkflowMessengerService();

const liveEventsService = new LiveEventsService();

const workflowManager = new DatabaseWorkflowManager(
  workflowMessengerService,
  taskQueue,
  runsService,
  projectsService,
  workflowQueues,
  db,
  liveEventsService,
  forgeSecretRepository,
  agentHarnessConfigRepository,
);

// Choose the VMM adapter for the current platform. VfkitAdapter uses Apple's Virtualization.framework
// on macOS (no separate virtiofsd); CloudHypervisorAdapter uses KVM + virtiofsd on Linux.
const vmPlatformAdapter =
  process.platform === "darwin"
    ? new VfkitAdapter(env.VFKIT_PATH)
    : new CloudHypervisorAdapter(env.CLOUD_HYPERVISOR_PATH, env.VIRTIOFSD_PATH);

const sandboxTypeConfigRepository = new DatabaseSandboxTypeConfigRepository();

// VM path env vars are optional — VM sandbox support may not be configured on all deployments.
// VmSandboxService accepts undefined here and throws a descriptive error at createNewSandbox time
// if a run actually requests a VM sandbox without the paths being set.
const vmSandboxService = new VmSandboxService(
  vmPlatformAdapter,
  env.VM_KERNEL_PATH,
  env.VM_ROOTFS_PATH,
  env.VM_INITRD_PATH,
  logger,
  {
    // Linux-only TAP/MAC wiring for cloud-hypervisor; vfkit ignores this and uses vmnet NAT.
    // CloudHypervisorAdapter fails fast at startVmm time when the TAP device is missing, rather
    // than booting a VM with no NIC that the in-guest driver can never reach the host from.
    networkConfig: {
      tapDevice: env.VM_TAP_DEVICE,
      mac: env.VM_MAC,
    },
  },
);

const workflowExecutionService = new WorkflowExecutionService(
  taskQueue,
  gitService,
  sandboxService,
  vmSandboxService,
  sandboxTypeConfigRepository,
  fileSystemService,
  harnesses,
  agentHarnessConfigRepository,
  harnessAuthService,
  workspaceMembershipsService,
  forgeSecretRepository,
  driverRunTokenStore,
  liveEventsService,
  logger,
  {
    docker: {
      mcpServerUrl: env.MCP_SERVER_URL,
      driverHostApiBaseUrl: env.DRIVER_HOST_API_BASE_URL,
    },
    // The in-VM guest cannot reach host.docker.internal (that's a Docker networking alias, not
    // available inside a VM). It reaches the host via the bridge/NAT gateway IP instead. That IP is
    // platform-specific and has no default, so VM endpoints only exist once the operator sets
    // VM_HOST_BRIDGE_IP; otherwise the VM run path reports a clear "not configured" error.
    vm:
      env.VM_HOST_BRIDGE_IP === undefined
        ? undefined
        : {
            mcpServerUrl: `http://${env.VM_HOST_BRIDGE_IP}:3050/mcp`,
            driverHostApiBaseUrl: `http://${env.VM_HOST_BRIDGE_IP}:${env.PORT}`,
          },
  },
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
  liveEventsService,
  agentHarnessConfigRepository,
);

export const services: Services = {
  db,
  taskQueue,
  driverRunTokenStore,
  sandboxService,
  vmSandboxService,
  sandboxTypeConfigRepository,
  gitService,
  workflowManager,
  workflowExecutionService,
  projectsService,
  workspacesService,
  workspaceMembershipsService,
  runsService,
  encryptionService,
  saltedEncryptionService,
  forgeSecretRepository,
  userOAuthCredentialRepository,
  agentHarnessConfigRepository,
  harnessAuthService,
  harnesses,
  workflowQueues,
  backgroundWorkflowProcessor,
  logger,
  liveEventsService,
};
