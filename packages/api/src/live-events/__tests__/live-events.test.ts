import { describe, expect, it } from "vitest";
import {
  liveEventDtoSchema,
  liveSubscriptionSchema,
  parseSubscriptionString,
  parseSubscriptionStrings,
  subscriptionToQueryValue,
} from "../index";

describe("live-events shared contract", () => {
  describe("parseSubscriptionString", () => {
    it("parses workspace-projects", () => {
      const result = parseSubscriptionString("workspace-projects");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ type: "workspace-projects" });
      }
    });

    it("parses workspace-projects with surrounding whitespace", () => {
      const result = parseSubscriptionString("  workspace-projects  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ type: "workspace-projects" });
      }
    });

    it("parses project-board with projectId", () => {
      const result = parseSubscriptionString("project-board:proj-123");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          type: "project-board",
          projectId: "proj-123",
        });
      }
    });

    it("rejects invalid subscription strings", () => {
      expect(parseSubscriptionString("").success).toBe(false);
      expect(parseSubscriptionString("invalid").success).toBe(false);
      expect(parseSubscriptionString("project-board").success).toBe(false);
      expect(parseSubscriptionString("workspace-projects:extra").success).toBe(
        false,
      );
    });
  });

  describe("parseSubscriptionStrings", () => {
    it("parses multiple valid subscriptions", () => {
      const result = parseSubscriptionStrings([
        "workspace-projects",
        "project-board:proj-a",
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([
          { type: "workspace-projects" },
          { type: "project-board", projectId: "proj-a" },
        ]);
      }
    });

    it("returns first invalid parse when any string is invalid", () => {
      const result = parseSubscriptionStrings([
        "workspace-projects",
        "invalid-sub",
      ]);
      expect(result.success).toBe(false);
    });

    it("parses empty array", () => {
      const result = parseSubscriptionStrings([]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe("subscriptionToQueryValue", () => {
    it("converts workspace-projects", () => {
      const sub = liveSubscriptionSchema.parse({ type: "workspace-projects" });
      expect(subscriptionToQueryValue(sub)).toBe("workspace-projects");
    });

    it("converts project-board", () => {
      const sub = liveSubscriptionSchema.parse({
        type: "project-board",
        projectId: "proj-x",
      });
      expect(subscriptionToQueryValue(sub)).toBe("project-board:proj-x");
    });
  });

  describe("liveEventDtoSchema", () => {
    it("parses valid project.updated payload", () => {
      const payload = {
        type: "project.updated",
        project: {
          id: "proj-1",
          workspaceId: "ws-1",
          name: "Test",
          shortCode: "TST",
          repositoryUrl: "https://github.com/owner/repo",
          workflowConfiguration: {
            version: "1",
            onTaskCompleted: "push-branch",
          },
          queueState: "idle",
          forgeType: "github",
          forgeBaseUrl: "https://github.com",
          hasForgeToken: false,
          agentConfig: null,
        },
      };
      const result = liveEventDtoSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === "project.updated") {
        expect(result.data.project.name).toBe("Test");
      }
    });

    it("parses valid task.updated payload", () => {
      const payload = {
        type: "task.updated",
        projectId: "proj-1",
        task: {
          id: "task-1",
          title: "Task",
          description: "Desc",
          completedOn: null,
          position: 0,
          agentConfig: null,
          subtasks: [],
        },
      };
      const result = liveEventDtoSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === "task.updated") {
        expect(result.data.projectId).toBe("proj-1");
        expect(result.data.task.title).toBe("Task");
      }
    });

    it("parses task.updated with completedOn and subtasks", () => {
      const payload = {
        type: "task.updated",
        projectId: "proj-1",
        task: {
          id: "task-1",
          title: "Done",
          description: "",
          completedOn: "2025-01-15T12:00:00.000Z",
          position: 0,
          agentConfig: null,
          subtasks: [
            {
              id: "sub-1",
              title: "Sub",
              description: "x",
              state: "completed",
            },
          ],
        },
      };
      const result = liveEventDtoSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success && result.data.type === "task.updated") {
        expect(result.data.task.completedOn).toBeInstanceOf(Date);
        expect(result.data.task.subtasks).toHaveLength(1);
      }
    });

    it("rejects invalid event type", () => {
      const result = liveEventDtoSchema.safeParse({
        type: "unknown.event",
        data: {},
      });
      expect(result.success).toBe(false);
    });

    it("rejects malformed project.updated", () => {
      const result = liveEventDtoSchema.safeParse({
        type: "project.updated",
        project: { id: "proj-1" }, // missing required fields
      });
      expect(result.success).toBe(false);
    });

    it("rejects malformed task.updated", () => {
      const result = liveEventDtoSchema.safeParse({
        type: "task.updated",
        projectId: "proj-1",
        task: { id: "task-1" }, // missing required fields
      });
      expect(result.success).toBe(false);
    });
  });
});
