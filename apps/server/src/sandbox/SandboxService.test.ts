import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type * as Dockerode from "dockerode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AbsoluteFilePath } from "../file-system/FilePath";
import type { DockerLoggingService } from "./DockerLoggingService";
import { DockerSandboxService } from "./SandboxService";

// ---------------------------------------------------------------------------
// createNewSandbox image selection
// ---------------------------------------------------------------------------
//
// The image agent containers run on is configuration (MAL_SANDBOX_IMAGE),
// resolved at the composition edge and passed into the service. These tests
// pin that the configured value — not a hard-coded "my-agent-loop" — is what
// actually reaches Docker's createContainer call.

describe("DockerSandboxService.createNewSandbox", () => {
  let workingDirectory: AbsoluteFilePath;

  beforeEach(() => {
    workingDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "sandbox-service-test-"),
    ) as AbsoluteFilePath;
  });

  afterEach(() => {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  });

  /**
   * Builds a fake Dockerode exposing just the methods createNewSandbox touches.
   * createContainer records the config it was called with so the test can assert
   * on the requested image.
   */
  const buildFakeDocker = () => {
    const createContainer = vi.fn(
      async (_config: Dockerode.ContainerCreateOptions) => ({
        id: "container-id",
        inspect: async () => ({ Name: "/sandbox-container" }),
      }),
    );

    const docker = {
      // No existing networks, so ensureSandboxNetwork creates one.
      listNetworks: vi.fn(async () => []),
      createNetwork: vi.fn(async () => ({})),
      createContainer,
    } as unknown as Dockerode;

    return { docker, createContainer };
  };

  const noopLogging = {
    attach: vi.fn(),
  } as unknown as DockerLoggingService;

  it("creates the container from the configured sandbox image", async () => {
    const { docker, createContainer } = buildFakeDocker();
    const service = new DockerSandboxService(
      docker,
      noopLogging,
      "ghcr.io/huddo121/my-agent-loop-sandbox:abc123",
    );

    await service.createNewSandbox({ workingDirectory });

    expect(createContainer).toHaveBeenCalledTimes(1);
    expect(createContainer.mock.calls[0]?.[0]).toMatchObject({
      Image: "ghcr.io/huddo121/my-agent-loop-sandbox:abc123",
    });
  });

  it("uses whichever image it was constructed with (no hard-coded default)", async () => {
    const { docker, createContainer } = buildFakeDocker();
    const service = new DockerSandboxService(
      docker,
      noopLogging,
      "my-agent-loop",
    );

    await service.createNewSandbox({ workingDirectory });

    expect(createContainer.mock.calls[0]?.[0]).toMatchObject({
      Image: "my-agent-loop",
    });
  });
});
