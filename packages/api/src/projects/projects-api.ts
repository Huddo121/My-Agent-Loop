import { Endpoint } from "cerato";
import z from "zod";
import { notFoundSchema } from "../common-schemas";
import { tasksApi } from "../tasks/tasks-api";
import { projectIdSchema, shortCodeCodec } from "./projects-model";

export const projectDtoSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  shortCode: shortCodeCodec,
});

export const createProjectRequestSchema = z.object({
  name: z.string(),
  shortCode: shortCodeCodec,
});

export const updateProjectRequestSchema = z.object({
  name: z.string(),
  shortCode: shortCodeCodec,
});

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
      },
    }),
  },
});
