import { Endpoint } from "cerato";
import z from "zod";
import { isoDatetimeToDate } from "../common-codecs";
import { badUserInputSchema, unauthenticatedSchema } from "../common-schemas";
import { workspaceDtoSchema } from "../workspaces/workspaces-api";

export const sessionUserDtoSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  image: z.string().nullable().optional(),
  emailVerified: z.boolean(),
  createdAt: isoDatetimeToDate,
  updatedAt: isoDatetimeToDate,
});
export type SessionUserDto = z.infer<typeof sessionUserDtoSchema>;

export const appSessionResponseSchema = z.object({
  user: sessionUserDtoSchema,
  workspaces: z.array(workspaceDtoSchema),
  needsWorkspaceBootstrap: z.boolean(),
});
export type AppSessionResponse = z.infer<typeof appSessionResponseSchema>;

export const bootstrapWorkspaceRequestSchema = z.object({
  name: z.string(),
});
export type BootstrapWorkspaceRequest = z.infer<
  typeof bootstrapWorkspaceRequestSchema
>;

export const sessionApi = Endpoint.multi({
  GET: Endpoint.get()
    .output(200, appSessionResponseSchema)
    .output(401, unauthenticatedSchema),
  children: {
    "bootstrap-workspace": Endpoint.post()
      .input(bootstrapWorkspaceRequestSchema)
      .output(200, workspaceDtoSchema)
      .output(400, badUserInputSchema)
      .output(401, unauthenticatedSchema),
  },
});
