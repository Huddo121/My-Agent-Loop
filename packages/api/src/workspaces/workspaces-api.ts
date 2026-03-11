import { Endpoint } from "cerato";
import z from "zod";
import { isoDatetimeToDate } from "../common-codecs";
import { badUserInputSchema, notFoundSchema } from "../common-schemas";
import {
  agentConfigSchema,
  agentHarnessIdSchema,
  harnessModelSchema,
} from "../harnesses/harnesses-model";
import { projectsApi } from "../projects/projects-api";
import { workspaceIdSchema } from "./workspaces-model";

export const workspaceDtoSchema = z.object({
  id: workspaceIdSchema,
  name: z.string(),
  createdAt: isoDatetimeToDate,
  agentConfig: agentConfigSchema.nullable(),
});
export type WorkspaceDto = z.infer<typeof workspaceDtoSchema>;

export const createWorkspaceRequestSchema = z.object({
  name: z.string(),
});
export type CreateWorkspaceRequest = z.infer<
  typeof createWorkspaceRequestSchema
>;

export const updateWorkspaceRequestSchema = z.object({
  name: z.string().optional(),
  agentConfig: agentConfigSchema.nullable().optional(),
});
export type UpdateWorkspaceRequest = z.infer<
  typeof updateWorkspaceRequestSchema
>;

export const harnessListItemSchema = z.object({
  id: agentHarnessIdSchema,
  displayName: z.string(),
  isAvailable: z.boolean(),
  models: z.array(harnessModelSchema),
});
export type HarnessListItem = z.infer<typeof harnessListItemSchema>;

export const harnessesResponseSchema = z.object({
  harnesses: z.array(harnessListItemSchema),
});
export type HarnessesResponse = z.infer<typeof harnessesResponseSchema>;

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
      PATCH: Endpoint.patch()
        .input(updateWorkspaceRequestSchema)
        .output(200, workspaceDtoSchema)
        .output(400, badUserInputSchema)
        .output(404, notFoundSchema),
      children: {
        harnesses: Endpoint.multi({
          GET: Endpoint.get()
            .output(200, harnessesResponseSchema)
            .output(404, notFoundSchema),
        }),
        projects: projectsApi,
      },
    }),
  },
});
