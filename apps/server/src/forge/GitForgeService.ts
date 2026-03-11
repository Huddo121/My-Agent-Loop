import type { Result } from "../utils/Result";
import type { GitHubService } from "./github/GitHubService";
import { GitHubServiceImpl } from "./github/GitHubService";
import type {
  GitHubJob,
  GitHubPullRequest,
  GitHubWorkflowRun,
} from "./github/GitHubTypes";
import type { GitLabService } from "./gitlab/GitLabService";
import { GitLabServiceImpl } from "./gitlab/GitLabServiceImpl";
import type {
  GitLabJob,
  GitLabMergeRequest,
  GitLabPipeline,
} from "./gitlab/GitLabTypes";
import type {
  CreateMergeRequestOptions,
  ForgeCredential,
  JobId,
  ListMergeRequestOptions,
  MergeRequest,
  MergeRequestId,
  Pipeline,
  PipelineId,
  PipelineJob,
} from "./types";

export interface GitForgeService {
  createMergeRequest(
    options: CreateMergeRequestOptions,
  ): Promise<Result<MergeRequest>>;
  getMergeRequest(id: MergeRequestId): Promise<Result<MergeRequest>>;
  listMergeRequests(
    options?: ListMergeRequestOptions,
  ): Promise<Result<MergeRequest[]>>;
  addMergeRequestComment(
    id: MergeRequestId,
    body: string,
  ): Promise<Result<void>>;

  listPipelines(ref?: string): Promise<Result<Pipeline[]>>;
  getPipeline(id: PipelineId): Promise<Result<Pipeline>>;
  listPipelineJobs(id: PipelineId): Promise<Result<PipelineJob[]>>;
  getJobLog(id: JobId): Promise<Result<string>>;

  testConnection(): Promise<Result<void>>;
}

// ---------------------------------------------------------------------------
// GitLab -> generic mappers
// ---------------------------------------------------------------------------

function gitlabMrToGeneric(mr: GitLabMergeRequest): MergeRequest {
  return {
    id: mr.id,
    title: mr.title,
    description: mr.description,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    state: mr.state,
    webUrl: mr.web_url,
  };
}

function gitlabPipelineToGeneric(p: GitLabPipeline): Pipeline {
  return {
    id: p.id,
    ref: p.ref,
    status: p.status,
    webUrl: p.web_url,
    createdAt: p.created_at,
  };
}

function gitlabJobToGeneric(j: GitLabJob): PipelineJob {
  return {
    id: j.id,
    name: j.name,
    stage: j.stage,
    status: j.status,
  };
}

// ---------------------------------------------------------------------------
// GitHub -> generic mappers
// ---------------------------------------------------------------------------

function githubPrToGeneric(pr: GitHubPullRequest): MergeRequest {
  return {
    id: pr.id,
    title: pr.title,
    description: pr.body,
    sourceBranch: pr.source_branch,
    targetBranch: pr.target_branch,
    state: pr.state,
    webUrl: pr.html_url,
  };
}

function githubWorkflowRunToGeneric(run: GitHubWorkflowRun): Pipeline {
  return {
    id: run.id,
    ref: run.head_branch,
    status: run.status,
    webUrl: run.html_url,
    createdAt: run.created_at,
  };
}

function githubJobToGeneric(j: GitHubJob): PipelineJob {
  return {
    id: j.id,
    name: j.name,
    stage: "",
    status: j.status,
  };
}

// ---------------------------------------------------------------------------
// GitLab implementation
// ---------------------------------------------------------------------------

class GitLabForgeService implements GitForgeService {
  constructor(private readonly service: GitLabService) {}

  async createMergeRequest(
    options: CreateMergeRequestOptions,
  ): Promise<Result<MergeRequest>> {
    const result = await this.service.createMergeRequest({
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
      title: options.title,
      description: options.description,
    });
    if (!result.success) return result;
    return { success: true, value: gitlabMrToGeneric(result.value) };
  }

  async getMergeRequest(id: MergeRequestId): Promise<Result<MergeRequest>> {
    if (id.platform !== "gitlab") {
      return {
        success: false,
        error: new Error(`Expected gitlab ID, got ${id.platform}`),
      };
    }
    const result = await this.service.getMergeRequest(id);
    if (!result.success) return result;
    return { success: true, value: gitlabMrToGeneric(result.value) };
  }

  async listMergeRequests(
    options?: ListMergeRequestOptions,
  ): Promise<Result<MergeRequest[]>> {
    const result = await this.service.listMergeRequests({
      state: options?.state,
      source_branch: options?.sourceBranch,
      target_branch: options?.targetBranch,
    });
    if (!result.success) return result;
    return { success: true, value: result.value.map(gitlabMrToGeneric) };
  }

  async addMergeRequestComment(
    id: MergeRequestId,
    body: string,
  ): Promise<Result<void>> {
    if (id.platform !== "gitlab") {
      return {
        success: false,
        error: new Error(`Expected gitlab ID, got ${id.platform}`),
      };
    }
    return this.service.addMergeRequestNote(id, body);
  }

  async listPipelines(ref?: string): Promise<Result<Pipeline[]>> {
    const result = await this.service.listPipelines(ref);
    if (!result.success) return result;
    return { success: true, value: result.value.map(gitlabPipelineToGeneric) };
  }

  async getPipeline(id: PipelineId): Promise<Result<Pipeline>> {
    if (id.platform !== "gitlab") {
      return {
        success: false,
        error: new Error(`Expected gitlab ID, got ${id.platform}`),
      };
    }
    const result = await this.service.getPipeline(id);
    if (!result.success) return result;
    return { success: true, value: gitlabPipelineToGeneric(result.value) };
  }

  async listPipelineJobs(id: PipelineId): Promise<Result<PipelineJob[]>> {
    if (id.platform !== "gitlab") {
      return {
        success: false,
        error: new Error(`Expected gitlab ID, got ${id.platform}`),
      };
    }
    const result = await this.service.listPipelineJobs(id);
    if (!result.success) return result;
    return { success: true, value: result.value.map(gitlabJobToGeneric) };
  }

  async getJobLog(id: JobId): Promise<Result<string>> {
    if (id.platform !== "gitlab") {
      return {
        success: false,
        error: new Error(`Expected gitlab ID, got ${id.platform}`),
      };
    }
    return this.service.getJobLog(id);
  }

  testConnection(): Promise<Result<void>> {
    return this.service.testConnection();
  }
}

// ---------------------------------------------------------------------------
// GitHub implementation
// ---------------------------------------------------------------------------

/**
 * Maps the generic ListMergeRequestOptions.state values to GitHub's pull
 * request list API state parameter.
 */
function toGitHubPrState(
  state?: ListMergeRequestOptions["state"],
): "open" | "closed" | "all" | undefined {
  switch (state) {
    case "opened":
      return "open";
    case "closed":
    case "merged":
      return "closed";
    case "all":
      return "all";
    default:
      return undefined;
  }
}

class GitHubForgeService implements GitForgeService {
  constructor(private readonly service: GitHubService) {}

  async createMergeRequest(
    options: CreateMergeRequestOptions,
  ): Promise<Result<MergeRequest>> {
    const result = await this.service.createPullRequest({
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
      title: options.title,
      description: options.description,
    });
    if (!result.success) return result;
    return { success: true, value: githubPrToGeneric(result.value) };
  }

  async getMergeRequest(id: MergeRequestId): Promise<Result<MergeRequest>> {
    if (id.platform !== "github") {
      return {
        success: false,
        error: new Error(`Expected github ID, got ${id.platform}`),
      };
    }
    const result = await this.service.getPullRequest(id);
    if (!result.success) return result;
    return { success: true, value: githubPrToGeneric(result.value) };
  }

  async listMergeRequests(
    options?: ListMergeRequestOptions,
  ): Promise<Result<MergeRequest[]>> {
    const wantMergedOnly = options?.state === "merged";
    const result = await this.service.listPullRequests({
      state: toGitHubPrState(options?.state),
      head: options?.sourceBranch,
      base: options?.targetBranch,
    });
    if (!result.success) return result;

    let prs = result.value;
    if (wantMergedOnly) {
      prs = prs.filter((pr) => pr.merged);
    }
    return { success: true, value: prs.map(githubPrToGeneric) };
  }

  async addMergeRequestComment(
    id: MergeRequestId,
    body: string,
  ): Promise<Result<void>> {
    if (id.platform !== "github") {
      return {
        success: false,
        error: new Error(`Expected github ID, got ${id.platform}`),
      };
    }
    return this.service.addPullRequestComment(id, body);
  }

  async listPipelines(ref?: string): Promise<Result<Pipeline[]>> {
    const result = await this.service.listWorkflowRuns(ref);
    if (!result.success) return result;
    return {
      success: true,
      value: result.value.map(githubWorkflowRunToGeneric),
    };
  }

  async getPipeline(id: PipelineId): Promise<Result<Pipeline>> {
    if (id.platform !== "github") {
      return {
        success: false,
        error: new Error(`Expected github ID, got ${id.platform}`),
      };
    }
    const result = await this.service.getWorkflowRun(id);
    if (!result.success) return result;
    return { success: true, value: githubWorkflowRunToGeneric(result.value) };
  }

  async listPipelineJobs(id: PipelineId): Promise<Result<PipelineJob[]>> {
    if (id.platform !== "github") {
      return {
        success: false,
        error: new Error(`Expected github ID, got ${id.platform}`),
      };
    }
    const result = await this.service.listWorkflowRunJobs(id);
    if (!result.success) return result;
    return { success: true, value: result.value.map(githubJobToGeneric) };
  }

  async getJobLog(id: JobId): Promise<Result<string>> {
    if (id.platform !== "github") {
      return {
        success: false,
        error: new Error(`Expected github ID, got ${id.platform}`),
      };
    }
    return this.service.getJobLog(id);
  }

  testConnection(): Promise<Result<void>> {
    return this.service.testConnection();
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Extracts the project path from a repository URL (e.g. "group/repo" for GitLab/GitHub).
 * Handles HTTPS, SSH (ssh://), and SCP-style (git@host:path) URLs.
 */
export function getProjectPathFromRepositoryUrl(repositoryUrl: string): string {
  const trimmed = repositoryUrl.trim();

  // SCP-style: git@host:path/to/repo.git — path is after the first colon
  if (trimmed.startsWith("git@")) {
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex !== -1) {
      const path = trimmed.slice(colonIndex + 1);
      return path.replace(/^\/+/, "").replace(/\.git$/i, "");
    }
  }

  // ssh://[user@]host[:port]/path — path is after the authority
  if (trimmed.startsWith("ssh://")) {
    try {
      const url = new URL(trimmed);
      return url.pathname.replace(/^\/+/, "").replace(/\.git$/i, "");
    } catch {
      // Fallback: strip ssh:// and take everything after first slash after host
      const withoutScheme = trimmed.slice(6); // "ssh://"
      const firstSlash = withoutScheme.indexOf("/");
      if (firstSlash !== -1) {
        const path = withoutScheme.slice(firstSlash);
        return path.replace(/^\/+/, "").replace(/\.git$/i, "");
      }
    }
  }

  // HTTPS/HTTP or other URL-like
  try {
    const url = new URL(trimmed);
    return url.pathname.replace(/^\/+/, "").replace(/\.git$/i, "");
  } catch {
    return trimmed.replace(/^\/+/, "").replace(/\.git$/i, "");
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Constructs the appropriate GitForgeService for a project's credential.
 */
export function createGitForgeService(
  credential: ForgeCredential,
): GitForgeService {
  switch (credential.forgeType) {
    case "gitlab":
      return new GitLabForgeService(new GitLabServiceImpl(credential));
    case "github":
      return new GitHubForgeService(new GitHubServiceImpl(credential));
  }
}
