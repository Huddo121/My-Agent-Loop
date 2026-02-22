import type { Result } from "../../utils/Result";
import type {
  GitHubJobId,
  GitHubPullRequestId,
  GitHubWorkflowRunId,
} from "../types";

const NOT_IMPLEMENTED = "GitHub forge is not yet implemented";

export interface GitHubPullRequest {
  id: GitHubPullRequestId;
  [key: string]: unknown;
}

export interface GitHubWorkflowRun {
  id: GitHubWorkflowRunId;
  [key: string]: unknown;
}

export interface GitHubJob {
  id: GitHubJobId;
  [key: string]: unknown;
}

export interface GitHubService {
  getPullRequest(id: GitHubPullRequestId): Promise<Result<GitHubPullRequest>>;
  createPullRequest(): Promise<Result<GitHubPullRequest>>;
  listPullRequests(): Promise<Result<GitHubPullRequest[]>>;
  addPullRequestComment(): Promise<Result<void>>;
  listWorkflowRuns(): Promise<Result<GitHubWorkflowRun[]>>;
  getWorkflowRun(id: GitHubWorkflowRunId): Promise<Result<GitHubWorkflowRun>>;
  listWorkflowRunJobs(): Promise<Result<GitHubJob[]>>;
  getJobLog(id: GitHubJobId): Promise<Result<string>>;
  testConnection(): Promise<Result<void>>;
}

export class GitHubServiceImpl implements GitHubService {
  async getPullRequest(): Promise<Result<GitHubPullRequest>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
  async createPullRequest(): Promise<Result<GitHubPullRequest>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
  async listPullRequests(): Promise<Result<GitHubPullRequest[]>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
  async addPullRequestComment(): Promise<Result<void>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
  async listWorkflowRuns(): Promise<Result<GitHubWorkflowRun[]>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
  async getWorkflowRun(): Promise<Result<GitHubWorkflowRun>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
  async listWorkflowRunJobs(): Promise<Result<GitHubJob[]>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
  async getJobLog(): Promise<Result<string>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
  async testConnection(): Promise<Result<void>> {
    return { success: false, error: new Error(NOT_IMPLEMENTED) };
  }
}
