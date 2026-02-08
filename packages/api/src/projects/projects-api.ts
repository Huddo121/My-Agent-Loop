import { Endpoint } from "cerato";
import z from "zod";
import { notFoundSchema } from "../common-schemas";
import { runIdSchema } from "../runs/runs-model";
import { tasksApi } from "../tasks/tasks-api";
import { projectIdSchema, shortCodeCodec } from "./projects-model";

// TODO: The Version of the workflow configuration should not be exposed over the API, only stored in the DB.
export const workflowConfigurationDtoSchema = z.object({
  version: z.literal("1"),
  onTaskCompleted: z.enum(["push-branch", "merge-immediately"]),
});
export type WorkflowConfigurationDto = z.infer<
  typeof workflowConfigurationDtoSchema
>;

export const queueStateDtoSchema = z.enum([
  "idle",
  "processing-single",
  "processing-loop",
  "failed",
]);
export type QueueStateDto = z.infer<typeof queueStateDtoSchema>;

export const projectDtoSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  shortCode: shortCodeCodec,
  repositoryUrl: z.string(),
  workflowConfiguration: workflowConfigurationDtoSchema,
  queueState: queueStateDtoSchema,
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const createProjectRequestSchema = projectDtoSchema.omit({
  id: true,
  queueState: true,
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = projectDtoSchema
  .omit({
    id: true,
    queueState: true,
  })
  .partial();
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

const runModeSchema = z.enum(["single", "loop"]);
export type RunMode = z.infer<typeof runModeSchema>;

export const startRunRequestSchema = z.object({
  mode: runModeSchema,
});
export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const runStartedResponseSchema = z.object({
  runId: runIdSchema,
});
export type RunStartedResponse = z.infer<typeof runStartedResponseSchema>;

export const runFailureResponseSchema = z.object({
  reason: z.literal([
    "no-tasks-available",
    "cannot-loop-with-review-workflow",
    "project-already-processing-tasks",
  ]),
});
export type RunFailureResponse = z.infer<typeof runFailureResponseSchema>;

export const projectsApi = Endpoint.multi({
  GET: Endpoint.get().output(200, z.array(projectDtoSchema)),
  POST: Endpoint.post()
    .input(createProjectRequestSchema)
    .output(200, projectDtoSchema),
  children: {
    ":projectId": Endpoint.multi({
      GET: Endpoint.get()
        .output(200, projectDtoSchema)
        .output(404, notFoundSchema),
      PATCH: Endpoint.patch()
        .input(updateProjectRequestSchema)
        .output(200, projectDtoSchema)
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
      },
    }),
  },
});
