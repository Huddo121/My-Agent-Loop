import z from "zod";

// The enum values here must stay in sync with the `sandbox_type` Postgres enum in
// apps/server/src/db/schema.ts. Both represent the same domain concept; the API
// schema is the single source of truth for the wire type and the TS type.
export const sandboxTypeSchema = z.enum(["docker", "vm"]);
export type SandboxType = z.infer<typeof sandboxTypeSchema>;

// For a workspace, null means "use the server default (docker)".
// For a project, null means "inherit from the workspace (which may itself fall back to default)".
export const sandboxTypeConfigResponseSchema = z.object({
  sandboxType: sandboxTypeSchema.nullable(),
});
export type SandboxTypeConfigResponse = z.infer<
  typeof sandboxTypeConfigResponseSchema
>;

export const setSandboxTypeRequestSchema = z.object({
  sandboxType: sandboxTypeSchema.nullable(),
});
export type SetSandboxTypeRequest = z.infer<typeof setSandboxTypeRequestSchema>;
