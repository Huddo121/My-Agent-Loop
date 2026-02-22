import type {
  GitLabJobId,
  GitLabMergeRequestId,
  GitLabPipelineId,
} from "../types";

export interface GitLabMergeRequest {
  id: GitLabMergeRequestId;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: string;
  source_branch: string;
  target_branch: string;
  web_url: string;
  labels: string[];
  [key: string]: unknown;
}

export interface GitLabCreateMergeRequestOptions {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
}

export interface GitLabListMergeRequestOptions {
  state?: "opened" | "closed" | "merged" | "all";
  source_branch?: string;
  target_branch?: string;
}

export interface GitLabPipeline {
  id: GitLabPipelineId;
  project_id: number;
  ref: string;
  status: string;
  web_url: string;
  created_at: string;
  [key: string]: unknown;
}

export interface GitLabJob {
  id: GitLabJobId;
  name: string;
  stage: string;
  status: string;
  [key: string]: unknown;
}
