import type {
  GitHubJobId,
  GitHubPullRequestId,
  GitHubWorkflowRunId,
} from "../types";

export interface GitHubPullRequest {
  id: GitHubPullRequestId;
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged: boolean;
  source_branch: string;
  target_branch: string;
  html_url: string;
  labels: string[];
}

export interface GitHubCreatePullRequestOptions {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
}

export interface GitHubListPullRequestOptions {
  state?: "open" | "closed" | "all";
  head?: string;
  base?: string;
}

export interface GitHubWorkflowRun {
  id: GitHubWorkflowRunId;
  name: string;
  head_branch: string;
  status: string;
  html_url: string;
  created_at: string;
}

export interface GitHubJob {
  id: GitHubJobId;
  name: string;
  status: string;
}
