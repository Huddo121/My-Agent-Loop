import type {
  LiveEventDto,
  ProjectId,
  ProjectShortCode,
  TaskId,
  TaskNumber,
  WorkspaceId,
} from "@mono/api";
import { describe, expect, it, vi } from "vitest";
import { LiveEventsService, type SendSSE } from "./LiveEventsService";

const ws1 = "ws-1" as WorkspaceId;
const ws2 = "ws-2" as WorkspaceId;
const projectA = "proj-a" as ProjectId;
const projectB = "proj-b" as ProjectId;

function mkSend(): SendSSE & { mock: { calls: [unknown][] } } {
  return vi.fn().mockResolvedValue(undefined) as unknown as SendSSE & {
    mock: { calls: [unknown][] };
  };
}

function mkProjectUpdated(
  workspaceId: WorkspaceId,
  projectId: ProjectId,
): LiveEventDto {
  return {
    type: "project.updated",
    project: {
      id: projectId,
      workspaceId,
      name: "p",
      shortCode: "P" as ProjectShortCode,
      repositoryUrl: "https://x.com/repo",
      workflowConfiguration: {
        version: "1",
        onTaskCompleted: "push-branch",
      },
      queueState: "idle",
      forgeType: "github",
      forgeBaseUrl: "https://github.com",
      hasForgeToken: true,
      agentConfig: null,
    },
  };
}

function mkTaskUpdated(
  _workspaceId: WorkspaceId,
  projectId: ProjectId,
): LiveEventDto {
  return {
    type: "task.updated",
    projectId,
    task: {
      id: "task-1" as TaskId,
      taskNumber: 1 as TaskNumber,
      title: "t",
      description: "d",
      completedOn: null,
      position: 0,
      activeRunState: null,
      agentConfig: null,
      subtasks: [],
    },
  };
}

describe("LiveEventsService", () => {
  it("registers and unregisters connections", () => {
    const service = new LiveEventsService({ heartbeatIntervalMs: 100_000 });
    const send = mkSend();
    const id = service.register({
      workspaceId: ws1,
      subscriptions: [{ type: "workspace-projects" }],
      send,
    });
    expect(service.getSubscriberCount()).toBe(1);
    service.unregister(id);
    expect(service.getSubscriberCount()).toBe(0);
  });

  it("publishes project.updated only to workspace-projects subscribers in that workspace", async () => {
    const service = new LiveEventsService({ heartbeatIntervalMs: 100_000 });
    const send1 = mkSend();
    const send2 = mkSend();
    service.register({
      workspaceId: ws1,
      subscriptions: [{ type: "workspace-projects" }],
      send: send1,
    });
    service.register({
      workspaceId: ws2,
      subscriptions: [{ type: "workspace-projects" }],
      send: send2,
    });

    const evt = mkProjectUpdated(ws1, projectA);
    await service.publish(ws1, evt);

    expect(send1).toHaveBeenCalledTimes(1);
    expect(send1).toHaveBeenCalledWith({
      event: "project.updated",
      data: JSON.stringify(evt),
    });
    expect(send2).not.toHaveBeenCalled();
  });

  it("publishes project.updated to project-board subscribers for that project", async () => {
    const service = new LiveEventsService({ heartbeatIntervalMs: 100_000 });
    const sendBoardA = mkSend();
    const sendBoardB = mkSend();
    service.register({
      workspaceId: ws1,
      subscriptions: [{ type: "project-board", projectId: projectA }],
      send: sendBoardA,
    });
    service.register({
      workspaceId: ws1,
      subscriptions: [{ type: "project-board", projectId: projectB }],
      send: sendBoardB,
    });

    const evt = mkProjectUpdated(ws1, projectA);
    await service.publish(ws1, evt);

    expect(sendBoardA).toHaveBeenCalledTimes(1);
    expect(sendBoardB).not.toHaveBeenCalled();
  });

  it("publishes task.updated only to project-board subscribers for that project", async () => {
    const service = new LiveEventsService({ heartbeatIntervalMs: 100_000 });
    const sendBoardA = mkSend();
    const sendBoardB = mkSend();
    const sendWsProjects = mkSend();
    service.register({
      workspaceId: ws1,
      subscriptions: [{ type: "project-board", projectId: projectA }],
      send: sendBoardA,
    });
    service.register({
      workspaceId: ws1,
      subscriptions: [{ type: "project-board", projectId: projectB }],
      send: sendBoardB,
    });
    service.register({
      workspaceId: ws1,
      subscriptions: [{ type: "workspace-projects" }],
      send: sendWsProjects,
    });

    const evt = mkTaskUpdated(ws1, projectA);
    await service.publish(ws1, evt);

    expect(sendBoardA).toHaveBeenCalledTimes(1);
    expect(sendBoardB).not.toHaveBeenCalled();
    expect(sendWsProjects).not.toHaveBeenCalled();
  });

  it("sends heartbeats to idle subscribers", async () => {
    const service = new LiveEventsService({ heartbeatIntervalMs: 50 });
    const sendMock = vi.fn().mockResolvedValue(undefined);
    const send = sendMock as unknown as SendSSE;
    service.register({
      workspaceId: ws1,
      subscriptions: [{ type: "workspace-projects" }],
      send,
    });

    await new Promise((r) => setTimeout(r, 120));

    expect(sendMock).toHaveBeenCalled();
    const hasPing = sendMock.mock.calls.some(
      (args) => (args[0] as { event?: string })?.event === "ping",
    );
    expect(hasPing).toBe(true);
  });
});
