import type { ProtectedString } from "../utils/ProtectedString";

/** Runtime-tagged forge ID base */
export type ForgeId<Platform extends string, Kind extends string> = {
  platform: Platform;
  kind: Kind;
  value: string;
};

/** GitLab-specific IDs */
export type GitLabMergeRequestId = ForgeId<"gitlab", "merge-request">;
export type GitLabPipelineId = ForgeId<"gitlab", "pipeline">;
export type GitLabJobId = ForgeId<"gitlab", "job">;

/** GitHub-specific IDs (future) */
export type GitHubPullRequestId = ForgeId<"github", "pull-request">;
export type GitHubWorkflowRunId = ForgeId<"github", "workflow-run">;
export type GitHubJobId = ForgeId<"github", "job">;

/** Union of all forge IDs for a given concept */
export type MergeRequestId = GitLabMergeRequestId | GitHubPullRequestId;
export type PipelineId = GitLabPipelineId | GitHubWorkflowRunId;
export type JobId = GitLabJobId | GitHubJobId;

export type ForgeType = "gitlab" | "github";

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
