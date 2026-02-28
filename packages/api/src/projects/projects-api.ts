import { Endpoint } from "cerato";
import z from "zod";
import { badUserInputSchema, notFoundSchema } from "../common-schemas";
import { agentHarnessIdSchema } from "../harnesses/harnesses-model";
import { runIdSchema } from "../runs/runs-model";
import { tasksApi } from "../tasks/tasks-api";
import { workspaceIdSchema } from "../workspaces/workspaces-model";
import { projectIdSchema, shortCodeCodec } from "./projects-model";

// TODO: The Version of the workflow configuration should not be exposed over the API, only stored in the DB.
export const workflowConfigurationDtoSchema = z.object({
  version: z.literal("1"),
  onTaskCompleted: z.enum([
    "push-branch",
    "merge-immediately",
    "push-branch-and-create-mr",
  ]),
});
export type WorkflowConfigurationDto = z.infer<
  typeof workflowConfigurationDtoSchema
>;

export const queueStateDtoSchema = z.enum([
  "idle",
  "processing-single",
  "processing-loop",
  "stopping",
  "failed",
]);
export type QueueStateDto = z.infer<typeof queueStateDtoSchema>;

export const forgeTypeSchema = z.enum(["gitlab", "github"]);

export const projectDtoSchema = z.object({
  id: projectIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string(),
  shortCode: shortCodeCodec,
  repositoryUrl: z.string(),
  workflowConfiguration: workflowConfigurationDtoSchema,
  queueState: queueStateDtoSchema,
  forgeType: forgeTypeSchema,
  forgeBaseUrl: z.string(),
  hasForgeToken: z.boolean(),
  agentHarnessId: agentHarnessIdSchema.nullable(),
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const createProjectRequestSchema = z.object({
  name: z.string(),
  shortCode: shortCodeCodec,
  repositoryUrl: z.string(),
  workflowConfiguration: workflowConfigurationDtoSchema,
  forgeType: forgeTypeSchema,
  forgeBaseUrl: z.string().url().optional(),
  forgeToken: z.string(),
  agentHarnessId: agentHarnessIdSchema.nullable().optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z.object({
  name: z.string().optional(),
  shortCode: shortCodeCodec.optional(),
  repositoryUrl: z.string().optional(),
  workflowConfiguration: workflowConfigurationDtoSchema.optional(),
  forgeType: forgeTypeSchema.optional(),
  forgeBaseUrl: z.string().url().optional(),
  forgeToken: z.string().optional(),
  agentHarnessId: agentHarnessIdSchema.nullable().optional(),
});
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

const runModeSchema = z.enum(["single", "loop"]);
export type RunMode = z.infer<typeof runModeSchema>;

export const startRunRequestSchema = z.object({
  mode: runModeSchema,
});
export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const runStartedResponseSchema = z.object({
  runId: runIdSchema,
  project: projectDtoSchema,
});
export type RunStartedResponse = z.infer<typeof runStartedResponseSchema>;

export const runFailureResponseSchema = z.object({
  reason: z.enum([
    "no-tasks-available",
    "cannot-loop-with-review-workflow",
    "project-already-processing-tasks",
  ]),
});
export type RunFailureResponse = z.infer<typeof runFailureResponseSchema>;

export const stopQueueRequestSchema = z.object({
  stopImmediately: z.boolean(),
});
export type StopQueueRequest = z.infer<typeof stopQueueRequestSchema>;

export const stopQueueFailureResponseSchema = z.object({
  reason: z.literal("queue-not-in-running-state"),
});
export type StopQueueFailureResponse = z.infer<
  typeof stopQueueFailureResponseSchema
>;

export const stopQueueResponseSchema = z.object({
  project: projectDtoSchema,
});
export type StopQueueResponse = z.infer<typeof stopQueueResponseSchema>;

export const testForgeConnectionSuccessSchema = z.object({
  success: z.literal(true),
});
export type TestForgeConnectionSuccess = z.infer<
  typeof testForgeConnectionSuccessSchema
>;

export const testForgeConnectionFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});
export type TestForgeConnectionFailure = z.infer<
  typeof testForgeConnectionFailureSchema
>;

/** Request body to test forge connection with provided credentials (e.g. from project dialog). */
export const testForgeConnectionRequestSchema = z.object({
  forgeType: forgeTypeSchema,
  forgeBaseUrl: z.string().url(),
  forgeToken: z.string(),
  repositoryUrl: z.string(),
});
export type TestForgeConnectionRequest = z.infer<
  typeof testForgeConnectionRequestSchema
>;

export const projectsApi = Endpoint.multi({
  GET: Endpoint.get().output(200, z.array(projectDtoSchema)),
  POST: Endpoint.post()
    .input(createProjectRequestSchema)
    .output(200, projectDtoSchema)
    .output(400, badUserInputSchema),
  children: {
    "test-forge-connection": Endpoint.post()
      .input(testForgeConnectionRequestSchema)
      .output(200, testForgeConnectionSuccessSchema)
      .output(400, testForgeConnectionFailureSchema),
    ":projectId": Endpoint.multi({
      GET: Endpoint.get()
        .output(200, projectDtoSchema)
        .output(404, notFoundSchema),
      PATCH: Endpoint.patch()
        .input(updateProjectRequestSchema)
        .output(200, projectDtoSchema)
        .output(400, badUserInputSchema)
        .output(404, notFoundSchema),
      DELETE: Endpoint.delete()
        .output(200, projectDtoSchema)
        .output(404, notFoundSchema),
      children: {
        tasks: tasksApi,
        run: Endpoint.post()
          .input(startRunRequestSchema)
          .output(200, runStartedResponseSchema)
          .output(400, runFailureResponseSchema)
          .output(404, notFoundSchema),
        stop: Endpoint.post()
          .input(stopQueueRequestSchema)
          .output(200, stopQueueResponseSchema)
          .output(400, stopQueueFailureResponseSchema)
          .output(404, notFoundSchema),
        "test-forge-connection": Endpoint.post()
          .output(200, testForgeConnectionSuccessSchema)
          .output(400, testForgeConnectionFailureSchema)
          .output(404, notFoundSchema),
      },
    }),
  },
});
