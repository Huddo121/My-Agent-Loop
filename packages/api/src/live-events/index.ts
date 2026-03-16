import z from "zod";
import { projectDtoSchema } from "../projects/projects-api";
import { projectIdSchema } from "../projects/projects-model";
import { taskDtoSchema } from "../tasks/tasks-api";

// --- LiveSubscription (discriminated union) ---

const workspaceProjectsSubscriptionSchema = z.object({
  type: z.literal("workspace-projects"),
});

const projectBoardSubscriptionSchema = z.object({
  type: z.literal("project-board"),
  projectId: projectIdSchema,
});

export const liveSubscriptionSchema = z.discriminatedUnion("type", [
  workspaceProjectsSubscriptionSchema,
  projectBoardSubscriptionSchema,
]);

export type LiveSubscription = z.infer<typeof liveSubscriptionSchema>;

// --- LiveEventDto (discriminated union) ---

const projectUpdatedEventSchema = z.object({
  type: z.literal("project.updated"),
  project: projectDtoSchema,
});

const taskUpdatedEventSchema = z.object({
  type: z.literal("task.updated"),
  projectId: projectIdSchema,
  task: taskDtoSchema,
});

export const liveEventDtoSchema = z.discriminatedUnion("type", [
  projectUpdatedEventSchema,
  taskUpdatedEventSchema,
]);

export type LiveEventDto = z.infer<typeof liveEventDtoSchema>;

// --- Parse subscription strings from query parameters ---

/**
 * Parses a single subscription string (e.g. from a query param) into a LiveSubscription.
 * Accepts:
 * - "workspace-projects"
 * - "project-board:<projectId>"
 */
export function parseSubscriptionString(input: string) {
  const trimmed = input.trim();
  if (trimmed === "workspace-projects") {
    return liveSubscriptionSchema.safeParse({ type: "workspace-projects" });
  }
  const projectBoardPrefix = "project-board:";
  if (trimmed.startsWith(projectBoardPrefix)) {
    const projectId = trimmed.slice(projectBoardPrefix.length);
    return liveSubscriptionSchema.safeParse({
      type: "project-board",
      projectId,
    });
  }
  return {
    success: false as const,
    error: new z.ZodError([
      {
        code: "custom",
        path: [],
        message: `Invalid subscription: expected "workspace-projects" or "project-board:<projectId>", got "${trimmed}"`,
      },
    ]),
  };
}

/**
 * Parses an array of subscription strings (e.g. from searchParams.getAll("subscription"))
 * into an array of LiveSubscription. Returns a failed parse if any string is invalid.
 */
export function parseSubscriptionStrings(inputs: string[]) {
  const results: LiveSubscription[] = [];
  for (const input of inputs) {
    const parsed = parseSubscriptionString(input);
    if (!parsed.success) return parsed;
    results.push(parsed.data);
  }
  return { success: true, data: results };
}

/**
 * Converts a LiveSubscription to its query param string representation.
 */
export function subscriptionToQueryValue(sub: LiveSubscription): string {
  switch (sub.type) {
    case "workspace-projects":
      return "workspace-projects";
    case "project-board":
      return `project-board:${sub.projectId}`;
  }
}
