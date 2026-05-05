import type { ProjectId, TaskId } from "@mono/api";
import { describe, expect, it } from "vitest";
import { ProtectedString } from "../utils/ProtectedString";
import type {
  HarnessAuthArtifacts,
  HarnessPreparationContext,
} from "./AgentHarness";
import { CodexCliHarness } from "./CodexCliHarness";

const baseContext = {
  projectId: "project-1" as ProjectId,
  taskId: "task-1" as TaskId,
  mcpServerUrl: "http://mcp.example.test/mcp",
  modelId: null,
};

describe("CodexCliHarness", () => {
  it("keeps the OPENAI_API_KEY env path for api-key auth", () => {
    const preparation = prepare({
      kind: "api-key",
      envName: "OPENAI_API_KEY",
      value: new ProtectedString("openai-api-key"),
    });

    expect(preparation.files).toEqual([
      expect.objectContaining({
        containerPath: "/root/.codex/config.toml",
      }),
    ]);
    expect(preparation.env).toMatchObject({
      MAL_PROJECT_ID: "project-1",
      MAL_TASK_ID: "task-1",
      OPENAI_API_KEY: "openai-api-key",
    });
  });

  it("merges Codex OAuth files and env with MAL task env", () => {
    const preparation = prepare({
      kind: "files-and-env",
      files: [
        {
          containerPath: "/root/.codex/auth.json",
          contents: '{"OPENAI_API_KEY":null}',
        },
      ],
      env: {
        CODEX_HOME: "/root/.codex",
        CODEX_USE_LOGIN: "1",
      },
    });

    expect(preparation.files).toEqual([
      expect.objectContaining({
        containerPath: "/root/.codex/config.toml",
      }),
      {
        containerPath: "/root/.codex/auth.json",
        contents: '{"OPENAI_API_KEY":null}',
      },
    ]);
    expect(preparation.env).toEqual({
      MAL_PROJECT_ID: "project-1",
      MAL_TASK_ID: "task-1",
      CODEX_HOME: "/root/.codex",
      CODEX_USE_LOGIN: "1",
    });
  });

  it("emits only MAL task env and config for none auth", () => {
    const preparation = prepare({ kind: "none" });

    expect(preparation.files).toEqual([
      expect.objectContaining({
        containerPath: "/root/.codex/config.toml",
      }),
    ]);
    expect(preparation.env).toEqual({
      MAL_PROJECT_ID: "project-1",
      MAL_TASK_ID: "task-1",
    });
  });
});

function prepare(auth: HarnessAuthArtifacts) {
  const harness = new CodexCliHarness();
  const context: HarnessPreparationContext = {
    ...baseContext,
    auth,
  };

  return harness.prepare(context);
}
