import z from "zod";
import type { ProtectedString } from "../utils/ProtectedString";

export type ForgeType = "gitlab" | "github";

/** Zod schemas for forge IDs (single source of truth; types from z.infer) */
const forgeIdValueSchema = z
  .string()
  .min(1, "Forge ID value must be non-empty");

export const gitLabMergeRequestIdSchema = z.object({
  platform: z.literal("gitlab"),
  kind: z.literal("merge-request"),
  value: forgeIdValueSchema,
});
export const gitLabPipelineIdSchema = z.object({
  platform: z.literal("gitlab"),
  kind: z.literal("pipeline"),
  value: forgeIdValueSchema,
});
export const gitLabJobIdSchema = z.object({
  platform: z.literal("gitlab"),
  kind: z.literal("job"),
  value: forgeIdValueSchema,
});
export const githubPullRequestIdSchema = z.object({
  platform: z.literal("github"),
  kind: z.literal("pull-request"),
  value: forgeIdValueSchema,
});
export const githubWorkflowRunIdSchema = z.object({
  platform: z.literal("github"),
  kind: z.literal("workflow-run"),
  value: forgeIdValueSchema,
});
export const githubJobIdSchema = z.object({
  platform: z.literal("github"),
  kind: z.literal("job"),
  value: forgeIdValueSchema,
});

export const mergeRequestIdSchema = z.union([
  gitLabMergeRequestIdSchema,
  githubPullRequestIdSchema,
]);
export const pipelineIdSchema = z.union([
  gitLabPipelineIdSchema,
  githubWorkflowRunIdSchema,
]);
export const jobIdSchema = z.union([gitLabJobIdSchema, githubJobIdSchema]);

/** Union of any forge ID – use for parsing when kind is determined at runtime */
export const forgeIdSchema = z.union([
  mergeRequestIdSchema,
  pipelineIdSchema,
  jobIdSchema,
]);

export type GitLabMergeRequestId = z.infer<typeof gitLabMergeRequestIdSchema>;
export type GitLabPipelineId = z.infer<typeof gitLabPipelineIdSchema>;
export type GitLabJobId = z.infer<typeof gitLabJobIdSchema>;
export type GitHubPullRequestId = z.infer<typeof githubPullRequestIdSchema>;
export type GitHubWorkflowRunId = z.infer<typeof githubWorkflowRunIdSchema>;
export type GitHubJobId = z.infer<typeof githubJobIdSchema>;
export type MergeRequestId = z.infer<typeof mergeRequestIdSchema>;
export type PipelineId = z.infer<typeof pipelineIdSchema>;
export type JobId = z.infer<typeof jobIdSchema>;
export type ForgeId = z.infer<typeof forgeIdSchema>;

/** Credential passed to forge and git operations */
export interface ForgeCredential {
  forgeType: ForgeType;
  forgeBaseUrl: string;
  token: ProtectedString;
  /** Project path on the forge (e.g. "group/repo" for GitLab) */
  projectPath: string;
}

/** Generic merge request (mapped from platform-specific types) */
export interface MergeRequest {
  id: MergeRequestId;
  title: string;
  description: string | null;
  sourceBranch: string;
  targetBranch: string;
  state: string;
  webUrl: string;
}

/** Generic pipeline */
export interface Pipeline {
  id: PipelineId;
  ref: string;
  status: string;
  webUrl: string;
  createdAt: string;
}

/** Generic pipeline job */
export interface PipelineJob {
  id: JobId;
  name: string;
  stage: string;
  status: string;
}

export interface CreateMergeRequestOptions {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
}

export interface ListMergeRequestOptions {
  state?: "opened" | "closed" | "merged" | "all";
  sourceBranch?: string;
  targetBranch?: string;
}
