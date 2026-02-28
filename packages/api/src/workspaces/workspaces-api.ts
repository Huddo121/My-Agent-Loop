import { Endpoint } from "cerato";
import z from "zod";
import { isoDatetimeToDate } from "../common-codecs";
import { notFoundSchema } from "../common-schemas";
import { projectsApi } from "../projects/projects-api";
import { workspaceIdSchema } from "./workspaces-model";

export const workspaceDtoSchema = z.object({
  id: workspaceIdSchema,
  name: z.string(),
  createdAt: isoDatetimeToDate,
});
export type WorkspaceDto = z.infer<typeof workspaceDtoSchema>;

export const createWorkspaceRequestSchema = z.object({
  name: z.string(),
});
export type CreateWorkspaceRequest = z.infer<
  typeof createWorkspaceRequestSchema
>;

export const workspacesApi = Endpoint.multi({
  GET: Endpoint.get().output(200, z.array(workspaceDtoSchema)),
  POST: Endpoint.post()
    .input(createWorkspaceRequestSchema)
    .output(200, workspaceDtoSchema),
  children: {
    ":workspaceId": Endpoint.multi({
      GET: Endpoint.get()
        .output(200, workspaceDtoSchema)
        .output(404, notFoundSchema),
      children: {
        projects: projectsApi,
      },
    }),
  },
});
