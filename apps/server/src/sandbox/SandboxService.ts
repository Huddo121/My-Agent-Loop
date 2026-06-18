import fs from "node:fs";
import type * as Dockerode from "dockerode";
import { AbsoluteFilePath } from "../file-system/FilePath";
import { absolutePath } from "../utils/absolutePath";
import type { Branded } from "../utils/Branded";
import type { Result } from "../utils/Result";
import type { DockerLoggingService } from "./DockerLoggingService";

/**
 * Agent sandboxes run on their own bridge network, deliberately separate from
 * the network hosting the app and its database. A misbehaving container can
 * still reach the internet (it needs to clone repos and install packages) but
 * has no route to Postgres/Redis — the server is the only thing bridging the
 * two sides, and it only exposes the driver API and MCP ports the agent needs.
 */
export const DEFAULT_SANDBOX_NETWORK_NAME = "mal-sandbox-net";

/** Docker returns 409 Conflict when asked to create a network that already exists. */
const isNetworkConflictError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  (error as { statusCode?: number }).statusCode === 409;

export type SandboxId = Branded<string, "SandboxId">;

export interface Sandbox {
  id: SandboxId;
  name: string;
}

export type SandboxInitOptions = {
  containerName?: string;
  /**
   * Host directory for this run, under the shared runs dir. The sandbox's own
   * mounts (e.g. lifecycle.sh) are staged here so their host-side paths are
   * visible to the Docker daemon even when the server itself runs in a container.
   */
  workingDirectory: AbsoluteFilePath;
  volumes?: {
    hostPath: AbsoluteFilePath;
    containerPath: string;
    mode?: "ro" | "rw";
  }[];
  env?: Record<string, string>;
  timeoutMs?: number;
};

export type StartSandboxFailure =
  | { reason: "container-not-found" }
  | { reason: "container-already-started" };

export type WaitForSandboxToFinishSuccess = {
  exitCode: number;
  reason: "completed" | "timeout" | "error";
};
export type WaitForSandboxToFinishFailure =
  | { reason: "container-not-found" }
  | { reason: "container-not-running" };

export interface SandboxService {
  createNewSandbox(options: SandboxInitOptions): Promise<Sandbox>;
  startSandbox(id: SandboxId): Promise<Result<"started", StartSandboxFailure>>;
  stopSandbox(id: SandboxId): Promise<void>;
  waitForSandboxToFinish(
    id: SandboxId,
  ): Promise<
    Result<WaitForSandboxToFinishSuccess, WaitForSandboxToFinishFailure>
  >;
  stopAllSandboxes(): Promise<void>;
}

export class DockerSandboxService implements SandboxService {
  private readonly knownSandboxes = new Set<SandboxId>();
  private sandboxNetworkReady: Promise<void> | undefined;

  constructor(
    private readonly docker: Dockerode,
    private readonly dockerLoggingService: DockerLoggingService,
    private readonly sandboxNetworkName: string = DEFAULT_SANDBOX_NETWORK_NAME,
  ) {}

  /**
   * Ensures the isolated sandbox bridge network exists before a container is
   * attached to it. Memoised so concurrent sandbox creations don't each pay the
   * lookup cost or race to create the same network.
   */
  private ensureSandboxNetwork(): Promise<void> {
    if (this.sandboxNetworkReady === undefined) {
      this.sandboxNetworkReady = this.createSandboxNetworkIfMissing();
    }
    return this.sandboxNetworkReady;
  }

  private async createSandboxNetworkIfMissing(): Promise<void> {
    // List all networks and match by exact name rather than using the Docker
    // `name` filter, which matches substrings (and would treat e.g.
    // "mal-sandbox-net-old" as a match).
    const existingNetworks = await this.docker.listNetworks();
    const alreadyExists = existingNetworks.some(
      (network) => network.Name === this.sandboxNetworkName,
    );
    if (alreadyExists) {
      return;
    }

    try {
      await this.docker.createNetwork({
        Name: this.sandboxNetworkName,
        Driver: "bridge",
      });
    } catch (error) {
      // A concurrent creator may have won the race between our check and create;
      // an existing network is the state we wanted, so treat that as success.
      if (isNetworkConflictError(error)) {
        return;
      }
      throw error;
    }
  }

  /**
   * Runs the teardown script ahead of schedule in the agent container.
   */
  private async manuallyExecuteTeardownScript(
    container: Dockerode.Container,
  ): Promise<void> {
    try {
      // Run teardown with 1 minute timeout inside container, plus 1 minute timeout for exec itself
      const exec = await container.exec({
        Cmd: [
          "sh",
          "-c",
          "if [ -f /code/.agent-loop/teardown.sh ]; then timeout 60 bash /code/.agent-loop/teardown.sh || true; fi",
        ],
        AttachStdout: true,
        AttachStderr: true,
      });

      await exec.start({});

      await new Promise<void>((resolve) => {
        // Poll for completion
        const checkInterval = setInterval(() => {
          exec.inspect((err, data) => {
            if (err) {
              clearInterval(checkInterval);
              // Container might be stopping, that's okay
              console.warn(`Could not inspect teardown exec: ${err.message}`);
              resolve();
            } else if (data?.Running === false) {
              clearInterval(checkInterval);
              if (data?.ExitCode !== 0 && data?.ExitCode !== null) {
                // Script might not exist (exit code 1) or failed/timed out, log but continue
                console.warn(
                  `Teardown script exited with code ${data.ExitCode}`,
                );
              }
              resolve();
            }
          });
        }, 1000);

        // Timeout after 65 seconds (60s for script + 5s buffer)
        setTimeout(() => {
          clearInterval(checkInterval);
          console.warn("Teardown script execution timed out at exec level");
          resolve();
        }, 65000);
      });
    } catch (error) {
      // Container might already be stopped, script might not exist, etc.
      // Log but don't throw - we still want to stop/remove the container
      console.warn(
        `Failed to execute teardown script: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async createNewSandbox(options: SandboxInitOptions): Promise<Sandbox> {
    const lifecycleScriptContainerPath = "/lifecycle.sh";

    // Stage lifecycle.sh inside the run's working directory rather than mounting
    // it straight from the server's source tree. The host Docker daemon can only
    // bind-mount paths it can see on the host; the working directory is mounted
    // in at an identical path, but the server's own files are not when the server
    // itself runs in a container.
    const lifecycleScriptSourcePath = absolutePath(
      import.meta.url,
      "lifecycle.sh",
    );
    const lifecycleScriptPath = AbsoluteFilePath.joinPath(
      options.workingDirectory,
      "lifecycle.sh",
    );
    fs.copyFileSync(lifecycleScriptSourcePath, lifecycleScriptPath);

    // Build volumes declaration (for Docker API)
    const volumes = {
      [lifecycleScriptContainerPath]: {},
      ...(options.volumes ?? []).reduce(
        (acc, { containerPath }) =>
          Object.assign(acc, {
            [containerPath]: {},
          }),
        {},
      ),
    };

    // Build binds array (actual mount points)
    // All host paths must be absolute for Docker bind mounts
    const binds = [
      `${lifecycleScriptPath}:${lifecycleScriptContainerPath}:ro`,
      ...(options.volumes ?? []).map(
        ({ hostPath, containerPath, mode }) =>
          `${hostPath}:${containerPath}${mode !== undefined ? `:${mode}` : ""}`,
      ),
    ];

    const envArray =
      options.env === undefined
        ? undefined
        : Object.entries(options.env).map(([k, v]) => `${k}=${v}`);

    await this.ensureSandboxNetwork();

    const container = await this.docker.createContainer({
      Image: "my-agent-loop",
      name: options.containerName,
      Volumes: volumes,
      HostConfig: {
        Binds: binds,
        // Map host.docker.internal to the host so the agent can reach the
        // server's driver API and MCP endpoints. Docker Desktop provides this
        // automatically, but on native Linux it must be requested explicitly.
        ExtraHosts: ["host.docker.internal:host-gateway"],
        // Keep the sandbox on its own bridge, off the app/DB network, so a
        // misbehaving agent container cannot reach Postgres/Redis directly.
        NetworkMode: this.sandboxNetworkName,
      },
      Env: envArray,
      Cmd: [lifecycleScriptContainerPath],
    });

    const id = container.id as SandboxId;
    this.knownSandboxes.add(id);

    const containerName = (await container.inspect()).Name;

    const sandbox = {
      id,
      name: containerName,
    } as const satisfies Sandbox;

    return sandbox;
  }

  async startSandbox(
    id: SandboxId,
  ): Promise<Result<"started", StartSandboxFailure>> {
    const containerKnown = this.knownSandboxes.has(id);

    if (containerKnown === false) {
      return { success: false, error: { reason: "container-not-found" } };
    }

    try {
      const container = this.docker.getContainer(id);

      const info = await container.inspect();

      if (info.State.Running) {
        return {
          success: false,
          error: { reason: "container-already-started" },
        };
      }

      await container.start();
      // Stream container logs to console
      const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: 0, // Start from the beginning
      });

      this.dockerLoggingService.attach(logStream, {
        containerName: info.Name,
        containerId: info.Id,
      });

      return { success: true, value: "started" };
    } catch (error) {
      console.error(
        `Error getting container (${id}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return { success: false, error: { reason: "container-not-found" } };
    }
  }

  async waitForSandboxToFinish(
    id: SandboxId,
  ): Promise<
    Result<WaitForSandboxToFinishSuccess, WaitForSandboxToFinishFailure>
  > {
    const containerResult = this.getContainer(id);
    if (containerResult.success === false) {
      return containerResult;
    }

    const container = containerResult.value;
    const info = await container.inspect();

    if (info.State.Running === false) {
      this.knownSandboxes.delete(id);
      return { success: false, error: { reason: "container-not-running" } };
    }

    /** This Promise will resolve when the container finishes on its own */
    const waitPromise = new Promise<{
      exitCode: number;
      reason: "completed" | "error";
    }>((resolve) => {
      container.wait((err, data) => {
        if (err) {
          resolve({ exitCode: -1, reason: "error" });
        } else {
          const exitCode = data?.StatusCode ?? -1;
          resolve({
            exitCode,
            reason: exitCode === 0 ? "completed" : "error",
          });
        }
      });
    });

    const result = await waitPromise;

    this.knownSandboxes.delete(id);
    await container.remove();

    return { success: true, value: result };
  }

  async stopSandbox(id: SandboxId): Promise<void> {
    const container = this.docker.getContainer(id);

    // Check if container is still running
    try {
      const info = await container.inspect();
      if (info.State.Running) {
        // Container is still running (timeout or manual stop)
        // Run teardown via exec before stopping
        await this.manuallyExecuteTeardownScript(container);
        await container.stop();
      } else {
        // Container already stopped (normal/error exit)
        // Teardown already ran as part of Cmd, just ensure it's stopped
        if (info.State.Status !== "exited") {
          await container.stop();
        }
      }
    } catch (error) {
      // Container might not exist, log and continue
      console.warn(
        `Error stopping container ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Remove the container
    try {
      await container.remove();
    } catch (error) {
      console.warn(
        `Error removing container ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.knownSandboxes.delete(id);
  }

  async stopAllSandboxes(): Promise<void> {
    const sandboxIds = [...this.knownSandboxes];
    if (sandboxIds.length === 0) {
      return;
    }

    console.log(`Stopping ${sandboxIds.length} active sandbox(es)...`);
    await Promise.all(sandboxIds.map((id) => this.stopSandbox(id)));
    console.log("All sandboxes stopped.");
  }

  private getContainer(
    id: SandboxId,
  ): Result<Dockerode.Container, { reason: "container-not-found" }> {
    const containerKnown = this.knownSandboxes.has(id);
    if (containerKnown === false) {
      return { success: false, error: { reason: "container-not-found" } };
    }

    try {
      const container = this.docker.getContainer(id);
      return { success: true, value: container };
    } catch {
      return { success: false, error: { reason: "container-not-found" } };
    }
  }
}
