import { Endpoint } from "cerato";
import z from "zod";
import { notFoundSchema } from "../common-schemas";
import { runIdSchema } from "../runs/runs-model";
import { tasksApi } from "../tasks/tasks-api";
import { projectIdSchema, shortCodeCodec } from "./projects-model";

export const workflowConfigurationDtoSchema = z.object({
  version: z.literal("1"),
  onTaskCompleted: z.enum(["push-branch", "merge-immediately"]),
});
export type WorkflowConfigurationDto = z.infer<
  typeof workflowConfigurationDtoSchema
>;

export const projectDtoSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  shortCode: shortCodeCodec,
  repositoryUrl: z.string(),
  workflowConfiguration: workflowConfigurationDtoSchema,
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const createProjectRequestSchema = projectDtoSchema.omit({ id: true });

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = createProjectRequestSchema;
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
          .output(404, notFoundSchema),
      },
    }),
  },
});
