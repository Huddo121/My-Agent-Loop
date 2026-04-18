import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  LiveEventDto,
  LiveSubscription,
  ProjectId,
  ProjectShortCode,
  TaskId,
  WorkspaceId,
} from "@mono/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DriverRunTokenStore } from "../../driver-api/DriverRunTokenStore";
import type { AbsoluteFilePath } from "../../file-system/FilePath";
import type { FileSystemService } from "../../file-system/FileSystemService";
import type { ForgeSecretRepository } from "../../forge-secrets";
import type { GitBranch, GitRepository } from "../../git/GitRepository";
import type { GitService } from "../../git/GitService";
import type { AgentHarness, AgentHarnessPreparation } from "../../harness";
import type { AgentHarnessConfigRepository } from "../../harness/AgentHarnessConfigRepository";
import type { HarnessAuthService } from "../../harness/HarnessAuthService";
import { LiveEventsService, type RegisterOptions, type SendSSE } from "../../live-events";
import type { Project } from "../../projects/ProjectsService";
import type { RunId } from "../../runs/RunId";
import type {
  Sandbox,
  SandboxId,
  SandboxInitOptions,
  SandboxService,
  StartSandboxFailure,
  WaitForSandboxToFinishFailure,
  WaitForSandboxToFinishSuccess,
} from "../../sandbox/SandboxService";
import type { Task, TaskQueue } from "../../task-queue/TaskQueue";
import { ProtectedString } from "../../utils/ProtectedString";
import type { Result } from "../../utils/Result";
import type { Workflow } from "../Workflow";
import { WorkflowExecutionService } from "../WorkflowExecutionService";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  vi.useRealTimers();
});

describe("WorkflowExecutionService", () => {
  it("keeps the driver token valid only while the sandbox is active", async () => {
    const driverRunTokenStore = new RecordingDriverRunTokenStore();
    const sandboxService = new RecordingSandboxService(driverRunTokenStore, {
      success: true,
      value: { exitCode: 0, reason: "completed" },
    });

    const service = createService({ driverRunTokenStore, sandboxService });
    const result = await service.executeWorkflow(
      createRunId("run-1"),
      createTask("task-1"),
      createProject("project-1"),
      createWorkflow(),
    );

    expect(result.success).toBe(true);
    expect(driverRunTokenStore.lastIssuedToken).toBeDefined();
    expect(sandboxService.lastDriverCliArgs).toContain("--driver-token");
    expect(sandboxService.lastDriverCliArgs).toContain(
      driverRunTokenStore.lastIssuedToken ?? "",
    );
    expect(sandboxService.tokenWasValidDuringWait).toBe(true);
    expect(
      driverRunTokenStore.isValidToken(
        createRunId("run-1"),
        driverRunTokenStore.lastIssuedToken ?? "",
      ),
    ).toBe(false);
  });

  it("generates a fresh driver token for each run", async () => {
    const firstStore = new RecordingDriverRunTokenStore();
    const secondStore = new RecordingDriverRunTokenStore();

    const firstService = createService({
      driverRunTokenStore: firstStore,
      sandboxService: new RecordingSandboxService(firstStore, {
        success: true,
        value: { exitCode: 0, reason: "completed" },
      }),
    });
    const secondService = createService({
      driverRunTokenStore: secondStore,
      sandboxService: new RecordingSandboxService(secondStore, {
        success: true,
        value: { exitCode: 0, reason: "completed" },
      }),
    });

    await firstService.executeWorkflow(
      createRunId("run-1"),
      createTask("task-1"),
      createProject("project-1"),
      createWorkflow(),
    );
    await secondService.executeWorkflow(
      createRunId("run-2"),
      createTask("task-2"),
      createProject("project-2"),
      createWorkflow(),
    );

    expect(firstStore.lastIssuedToken).toBeDefined();
    expect(secondStore.lastIssuedToken).toBeDefined();
    expect(firstStore.lastIssuedToken).toHaveLength(64);
    expect(secondStore.lastIssuedToken).toHaveLength(64);
    expect(firstStore.lastIssuedToken).not.toEqual(secondStore.lastIssuedToken);
  });

  it("clears the driver token after sandbox failures", async () => {
    const driverRunTokenStore = new RecordingDriverRunTokenStore();
    const sandboxService = new RecordingSandboxService(driverRunTokenStore, {
      success: true,
      value: { exitCode: 1, reason: "error" },
    });

    const service = createService({ driverRunTokenStore, sandboxService });
    const result = await service.executeWorkflow(
      createRunId("run-error"),
      createTask("task-error"),
      createProject("project-error"),
      createWorkflow(),
    );

    expect(result.success).toBe(false);
    expect(sandboxService.tokenWasValidDuringWait).toBe(true);
    expect(
      driverRunTokenStore.isValidToken(
        createRunId("run-error"),
        driverRunTokenStore.lastIssuedToken ?? "",
      ),
    ).toBe(false);
    expect(sandboxService.stopSandboxCallCount).toBe(0);
  });

  it("does not stop an already-finished sandbox on success", async () => {
    const driverRunTokenStore = new RecordingDriverRunTokenStore();
    const sandboxService = new RecordingSandboxService(driverRunTokenStore, {
      success: true,
      value: { exitCode: 0, reason: "completed" },
    });

    const service = createService({ driverRunTokenStore, sandboxService });
    const result = await service.executeWorkflow(
      createRunId("run-success"),
      createTask("task-success"),
      createProject("project-success"),
      createWorkflow(),
    );

    expect(result.success).toBe(true);
    expect(sandboxService.stopSandboxCallCount).toBe(0);
  });

  it("stops the sandbox when waiting for completion fails", async () => {
    const driverRunTokenStore = new RecordingDriverRunTokenStore();
    const sandboxService = new RecordingSandboxService(driverRunTokenStore, {
      success: false,
      error: { reason: "container-not-running" },
    });

    const service = createService({ driverRunTokenStore, sandboxService });
    const result = await service.executeWorkflow(
      createRunId("run-wait-failure"),
      createTask("task-wait-failure"),
      createProject("project-wait-failure"),
      createWorkflow(),
    );

    expect(result.success).toBe(false);
    expect(sandboxService.stopSandboxCallCount).toBe(1);
    expect(sandboxService.tokenWasValidWhenStopped).toBe(true);
  });

  it("stops the sandbox when startup fails after creation", async () => {
    const driverRunTokenStore = new RecordingDriverRunTokenStore();
    const sandboxService = new RecordingSandboxService(
      driverRunTokenStore,
      {
        success: true,
        value: { exitCode: 0, reason: "completed" },
      },
      {
        success: false,
        error: { reason: "container-not-found" },
      },
    );

    const service = createService({ driverRunTokenStore, sandboxService });
    const result = await service.executeWorkflow(
      createRunId("run-start-failure"),
      createTask("task-start-failure"),
      createProject("project-start-failure"),
      createWorkflow(),
    );

    expect(result.success).toBe(false);
    expect(sandboxService.stopSandboxCallCount).toBe(1);
    expect(sandboxService.tokenWasValidWhenStopped).toBe(true);
  });

  it("keeps the driver token valid until a timed-out sandbox is stopped", async () => {
    vi.useFakeTimers();

    const driverRunTokenStore = new RecordingDriverRunTokenStore();
    const sandboxService = new HangingSandboxService(driverRunTokenStore);
    const service = createService({ driverRunTokenStore, sandboxService });

    const executionPromise = service.executeWorkflow(
      createRunId("run-timeout"),
      createTask("task-timeout"),
      createProject("project-timeout"),
      createWorkflow(),
    );

    await vi.advanceTimersByTimeAsync(3600000);

    const result = await executionPromise;

    expect(result.success).toBe(false);
    expect(sandboxService.stopSandboxCallCount).toBe(1);
    expect(sandboxService.tokenWasValidWhenStopped).toBe(true);
    expect(
      driverRunTokenStore.isValidToken(
        createRunId("run-timeout"),
        driverRunTokenStore.lastIssuedToken ?? "",
      ),
    ).toBe(false);
  });
});

function createService(options: {
  driverRunTokenStore: DriverRunTokenStore;
  sandboxService: SandboxService;
}): WorkflowExecutionService {
  return new WorkflowExecutionService(
    createTaskQueue(),
    createGitService(),
    options.sandboxService,
    createFileSystemService(),
    [createHarness()],
    createHarnessConfigRepository(),
    createHarnessAuthService(),
    createForgeSecretRepository(),
    options.driverRunTokenStore,
    createLiveEventsService(),
  );
}

function createTask(taskId: string): Task {
  return {
    id: taskId as TaskId,
    title: `Task ${taskId}`,
    description: `Description for ${taskId}`,
    subtasks: [],
  };
}

function createProject(projectId: string): Project {
  return {
    id: projectId as ProjectId,
    workspaceId: "workspace-1" as WorkspaceId,
    name: `Project ${projectId}`,
    shortCode: "TEST" as ProjectShortCode,
    repositoryUrl: "https://example.com/repo.git",
    workflowConfiguration: {
      version: "1",
      onTaskCompleted: "push-branch",
    },
    queueState: "processing-single",
    forgeType: "github",
    forgeBaseUrl: "https://github.com",
    agentConfig: null,
  };
}

function createWorkflow(): Workflow {
  return {
    async onTaskCompleted(): Promise<Result<void, Error>> {
      return { success: true, value: undefined };
    },
  };
}

function createRunId(value: string): RunId {
  return value as RunId;
}

function createTaskQueue(): TaskQueue {
  return {
    async getAllTasks() {
      return [];
    },
    async getTask() {
      return undefined;
    },
    async getProjectIdForTask() {
      return undefined;
    },
    async addTask() {
      throw new Error("not implemented in test");
    },
    async updateTask() {
      return undefined;
    },
    async getNextTask() {
      return undefined;
    },
    async isEmpty() {
      return true;
    },
    async completeTask(id) {
      return createTask(id);
    },
    async moveTask() {
      return undefined;
    },
    async taskCount() {
      return { total: 0, completed: 0 };
    },
  };
}

function createGitService(): GitService {
  return {
    async checkoutRepository(options): Promise<Result<GitRepository>> {
      fs.mkdirSync(options.targetDirectory, { recursive: true });
      return {
        success: true,
        value: {
          path: options.targetDirectory,
          branch: options.branch,
        },
      };
    },
    async detectMainBranch() {
      return { success: true, value: "main" as GitBranch };
    },
    async getRepositoryMetadata(targetDirectory) {
      return {
        success: true,
        value: { path: targetDirectory, branch: "main" as GitBranch },
      };
    },
    async commitRepository() {
      return { success: true, value: undefined };
    },
    async pushRepository() {
      return { success: true, value: undefined };
    },
    async mergeBranchInToCurrentBranch() {
      return { success: true, value: undefined };
    },
    async checkoutBranch() {
      return { success: true, value: undefined };
    },
  };
}

function createFileSystemService(): FileSystemService {
  return {
    async createTemporaryDirectory(runId): Promise<AbsoluteFilePath> {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), `workflow-execution-${runId}-`),
      );
      tempDirectories.push(directory);
      return directory as AbsoluteFilePath;
    },
  };
}

function createHarness(): AgentHarness {
  return {
    id: "opencode",
    displayName: "OpenCode",
    models: [],
    prepare(): AgentHarnessPreparation {
      return {
        files: [],
        setupCommands: [],
        runCommand: "opencode run",
        env: {},
      };
    },
  };
}

function createHarnessConfigRepository(): AgentHarnessConfigRepository {
  return {
    async getWorkspaceConfig() {
      return null;
    },
    async getProjectConfig() {
      return null;
    },
    async getProjectConfigs() {
      return {};
    },
    async getTaskConfig() {
      return null;
    },
    async getTaskConfigs() {
      return new Map();
    },
    async setWorkspaceConfig() {},
    async setProjectConfig() {},
    async setTaskConfig() {},
    async resolveHarnessConfig() {
      return { harnessId: "opencode", modelId: null };
    },
  };
}

function createHarnessAuthService(): HarnessAuthService {
  return {
    isAvailable() {
      return true;
    },
    getCredential() {
      return undefined;
    },
  };
}

function createForgeSecretRepository(): ForgeSecretRepository {
  return {
    async getForgeSecret() {
      return new ProtectedString("forge-token");
    },
    async upsertForgeSecret() {},
    async deleteForgeSecret() {},
    async hasForgeSecret() {
      return true;
    },
  };
}

function createLiveEventsService(): LiveEventsService {
  return new FakeLiveEventsService();
}

/**
 * One successful `register()` call: workspace scope, subscriptions, and the
 * client `send` callback so tests can drive or assert on SSE delivery.
 */
interface FakeLiveEventsRegistration {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly subscriptions: LiveSubscription[];
  readonly send: SendSSE;
}

/**
 * Test double for `LiveEventsService`: records traffic and exposes each
 * operation as a replaceable function (`registerHandler`, etc.) so callers
 * can wrap or replace them with `vi.fn()` without reimplementing capture logic.
 */
class FakeLiveEventsService extends LiveEventsService {
  private nextFakeRegistrationId = 0;
  private readonly activeConnectionIds = new Set<string>();

  /** Every register() in order; `send` is the callback passed by production code. */
  registrations: FakeLiveEventsRegistration[] = [];
  unregisterConnectionIds: string[] = [];
  publishCalls: Array<{ workspaceId: WorkspaceId; event: LiveEventDto }> = [];

  registerHandler = (options: RegisterOptions): string => {
    const id = `fake-live-events-${++this.nextFakeRegistrationId}`;
    this.registrations.push({
      id,
      workspaceId: options.workspaceId,
      subscriptions: options.subscriptions,
      send: options.send,
    });
    this.activeConnectionIds.add(id);
    return id;
  };

  unregisterHandler = (connectionId: string): void => {
    this.unregisterConnectionIds.push(connectionId);
    this.activeConnectionIds.delete(connectionId);
  };

  publishHandler = async (
    workspaceId: WorkspaceId,
    event: LiveEventDto,
  ): Promise<void> => {
    this.publishCalls.push({ workspaceId, event });
  };

  getSubscriberCountHandler = (): number => this.activeConnectionIds.size;

  override register(options: RegisterOptions): string {
    return this.registerHandler(options);
  }

  override unregister(connectionId: string): void {
    this.unregisterHandler(connectionId);
  }

  override async publish(
    workspaceId: WorkspaceId,
    event: LiveEventDto,
  ): Promise<void> {
    await this.publishHandler(workspaceId, event);
  }

  override getSubscriberCount(): number {
    return this.getSubscriberCountHandler();
  }
}

class RecordingDriverRunTokenStore implements DriverRunTokenStore {
  private readonly tokens = new Map<RunId, string>();
  lastRunId: RunId | undefined;
  lastIssuedToken: string | undefined;

  setToken(runId: RunId, token: string): void {
    this.lastRunId = runId;
    this.lastIssuedToken = token;
    this.tokens.set(runId, token);
  }

  clearToken(runId: RunId): void {
    this.tokens.delete(runId);
  }

  isValidToken(runId: RunId, candidateToken: string): boolean {
    return this.tokens.get(runId) === candidateToken;
  }
}

class RecordingSandboxService implements SandboxService {
  lastDriverCliArgs = "";
  tokenWasValidDuringWait = false;
  tokenWasValidWhenStopped = false;
  stopSandboxCallCount = 0;

  constructor(
    protected readonly driverRunTokenStore: RecordingDriverRunTokenStore,
    private readonly waitResult: Result<
      WaitForSandboxToFinishSuccess,
      WaitForSandboxToFinishFailure
    >,
    private readonly startResult: Result<"started", StartSandboxFailure> = {
      success: true,
      value: "started",
    },
  ) {}

  async createNewSandbox(options: SandboxInitOptions): Promise<Sandbox> {
    this.lastDriverCliArgs = options.env?.MAL_DRIVER_CLI_ARGS ?? "";
    return {
      id: "sandbox-1" as SandboxId,
      name: "sandbox-1",
    };
  }

  async startSandbox() {
    return this.startResult;
  }

  async stopSandbox() {
    this.stopSandboxCallCount += 1;

    const token = this.driverRunTokenStore.lastIssuedToken;
    const runId = this.driverRunTokenStore.lastRunId;
    if (token !== undefined && runId !== undefined) {
      this.tokenWasValidWhenStopped = this.driverRunTokenStore.isValidToken(
        runId,
        token,
      );
    }
  }

  async waitForSandboxToFinish() {
    const token = this.driverRunTokenStore.lastIssuedToken;
    const runId = this.driverRunTokenStore.lastRunId;
    if (token !== undefined && runId !== undefined) {
      this.tokenWasValidDuringWait = this.driverRunTokenStore.isValidToken(
        runId,
        token,
      );
    }
    return this.waitResult;
  }

  async stopAllSandboxes() {}
}

class HangingSandboxService extends RecordingSandboxService {
  constructor(driverRunTokenStore: RecordingDriverRunTokenStore) {
    super(driverRunTokenStore, {
      success: true,
      value: { exitCode: 0, reason: "completed" },
    });
  }

  override async stopSandbox() {
    await super.stopSandbox();
  }

  override async waitForSandboxToFinish() {
    const token = this.driverRunTokenStore.lastIssuedToken;
    const runId = this.driverRunTokenStore.lastRunId;
    if (token !== undefined && runId !== undefined) {
      this.tokenWasValidDuringWait = this.driverRunTokenStore.isValidToken(
        runId,
        token,
      );
    }

    return new Promise<
      Result<WaitForSandboxToFinishSuccess, WaitForSandboxToFinishFailure>
    >(() => {
      // Intentionally never resolves to exercise timeout cleanup.
    });
  }
}
