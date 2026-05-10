import type { HarnessesResponse, ProjectId, WorkspaceId } from "@mono/api";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { fn } from "storybook/test";
import { CurrentWorkspaceProvider } from "~/lib/workspaces";
import type { Project, Task, Workspace } from "~/types";
import { TaskDialog } from "./TaskDialog";

const workspace: Workspace = {
  id: "workspace-storybook" as WorkspaceId,
  name: "Storybook Workspace",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  agentConfig: {
    harnessId: "opencode",
    modelId: null,
  },
};

const project: Project = {
  id: "project-storybook" as ProjectId,
  workspaceId: workspace.id,
  name: "Agent UI",
  shortCode: "AGENTUI" as Project["shortCode"],
  repositoryUrl: "https://github.com/example/agent-ui",
  workflowConfiguration: {
    version: "1",
    onTaskCompleted: "push-branch-and-create-mr",
  },
  queueState: "idle",
  forgeType: "github",
  forgeBaseUrl: "https://github.com",
  hasForgeToken: true,
  agentConfig: {
    harnessId: "codex-cli",
    modelId: "gpt-5.4",
  },
};

const harnesses: HarnessesResponse = {
  harnesses: [
    {
      id: "opencode",
      displayName: "OpenCode",
      isAvailable: true,
      models: [
        { id: "opencode-default", displayName: "OpenCode default" },
        { id: "sonnet-4.5", displayName: "Claude Sonnet 4.5" },
      ],
    },
    {
      id: "codex-cli",
      displayName: "Codex CLI",
      isAvailable: true,
      models: [
        { id: "gpt-5.4", displayName: "GPT-5.4" },
        { id: "gpt-5.4-mini", displayName: "GPT-5.4 Mini" },
      ],
    },
    {
      id: "cursor-cli",
      displayName: "Cursor CLI",
      isAvailable: false,
      models: [{ id: "cursor-auto", displayName: "Cursor auto" }],
    },
  ],
};

const existingTask: Task = {
  id: "task-storybook" as Task["id"],
  taskNumber: 42 as Task["taskNumber"],
  title: "Set up Storybook coverage for task workflows",
  description:
    "Add representative stories for the task dialog, including harness overrides and subtasks.",
  completedOn: null,
  position: 1,
  activeRunState: null,
  agentConfig: {
    harnessId: "codex-cli",
    modelId: "gpt-5.4",
  },
  subtasks: [
    {
      id: "story-1" as Task["subtasks"][number]["id"],
      title: "Seed React Query state for harnesses",
      description: "Keep stories independent from the backend.",
      state: "completed",
    },
    {
      id: "story-2" as Task["subtasks"][number]["id"],
      title: "Verify keyboard submit behavior",
      state: "in-progress",
    },
    {
      id: "story-3" as Task["subtasks"][number]["id"],
      title: "Add Chromatic baseline",
      state: "pending",
    },
  ],
};

function StoryProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    client.setQueryData(["workspaces", workspace.id, "harnesses"], harnesses);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <CurrentWorkspaceProvider workspace={workspace}>
        {children}
      </CurrentWorkspaceProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Tasks/TaskDialog",
  component: TaskDialog,
  decorators: [
    (Story) => (
      <StoryProviders>
        <Story />
      </StoryProviders>
    ),
  ],
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    onOpenChange: fn(),
    onSubmit: fn(),
    project,
  },
} satisfies Meta<typeof TaskDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddTask: Story = {};

export const EditTask: Story = {
  args: {
    task: existingTask,
  },
};
