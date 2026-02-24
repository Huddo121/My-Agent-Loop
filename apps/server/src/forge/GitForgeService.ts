import { match } from "ts-pattern";
import type { Result } from "../utils/Result";
import { GitHubServiceImpl } from "./github/GitHubService";
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

function toGenericMergeRequest(mr: GitLabMergeRequest): MergeRequest {
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

function toGenericPipeline(p: GitLabPipeline): Pipeline {
  return {
    id: p.id,
    ref: p.ref,
    status: p.status,
    webUrl: p.web_url,
    createdAt: p.created_at,
  };
}

function toGenericJob(j: GitLabJob): PipelineJob {
  return {
    id: j.id,
    name: j.name,
    stage: j.stage,
    status: j.status,
  };
}

export class DefaultGitForgeService implements GitForgeService {
  constructor(
    private readonly credential: ForgeCredential,
    private readonly gitLabService: GitLabService,
    private readonly gitHubService: GitHubServiceImpl,
  ) {}

  async createMergeRequest(
    options: CreateMergeRequestOptions,
  ): Promise<Result<MergeRequest>> {
    return match(this.credential.forgeType)
      .with("gitlab", async () => {
        const result = await this.gitLabService.createMergeRequest({
          sourceBranch: options.sourceBranch,
          targetBranch: options.targetBranch,
          title: options.title,
          description: options.description,
        });
        if (!result.success) return result;
        return {
          success: true as const,
          value: toGenericMergeRequest(result.value),
        };
      })
      .with("github", async () => {
        const result = await this.gitHubService.createPullRequest();
        if (!result.success) return result;
        return {
          success: true as const,
          value: {
            id: result.value.id,
            title: "",
            description: null,
            sourceBranch: "",
            targetBranch: "",
            state: "",
            webUrl: "",
          },
        };
      })
      .exhaustive();
  }

  async getMergeRequest(id: MergeRequestId): Promise<Result<MergeRequest>> {
    return match(id)
      .with({ platform: "gitlab" }, async (gitlabId) => {
        const result = await this.gitLabService.getMergeRequest(gitlabId);
        if (!result.success) return result;
        return {
          success: true as const,
          value: toGenericMergeRequest(result.value),
        };
      })
      .with({ platform: "github" }, async () => {
        return {
          success: false as const,
          error: new Error("GitHub not yet implemented"),
        };
      })
      .exhaustive();
  }

  async listMergeRequests(
    options?: ListMergeRequestOptions,
  ): Promise<Result<MergeRequest[]>> {
    return match(this.credential.forgeType)
      .with("gitlab", async () => {
        const result = await this.gitLabService.listMergeRequests({
          state: options?.state,
          source_branch: options?.sourceBranch,
          target_branch: options?.targetBranch,
        });
        if (!result.success) return result;
        return {
          success: true as const,
          value: result.value.map(toGenericMergeRequest),
        };
      })
      .with("github", async () => {
        const result = await this.gitHubService.listPullRequests();
        if (!result.success) return result;
        return { success: true as const, value: [] };
      })
      .exhaustive();
  }

  async addMergeRequestComment(
    id: MergeRequestId,
    body: string,
  ): Promise<Result<void>> {
    return match(id)
      .with({ platform: "gitlab" }, (gitlabId) =>
        this.gitLabService.addMergeRequestNote(gitlabId, body),
      )
      .with({ platform: "github" }, async () => {
        return this.gitHubService.addPullRequestComment();
      })
      .exhaustive();
  }

  async listPipelines(ref?: string): Promise<Result<Pipeline[]>> {
    return match(this.credential.forgeType)
      .with("gitlab", async () => {
        const result = await this.gitLabService.listPipelines(ref);
        if (!result.success) return result;
        return {
          success: true as const,
          value: result.value.map(toGenericPipeline),
        };
      })
      .with("github", async () => {
        const result = await this.gitHubService.listWorkflowRuns();
        if (!result.success) return result;
        return { success: true as const, value: [] };
      })
      .exhaustive();
  }

  async getPipeline(id: PipelineId): Promise<Result<Pipeline>> {
    return match(id)
      .with({ platform: "gitlab" }, async (gitlabId) => {
        const result = await this.gitLabService.getPipeline(gitlabId);
        if (!result.success) return result;
        return {
          success: true as const,
          value: toGenericPipeline(result.value),
        };
      })
      .with({ platform: "github" }, async () => {
        return {
          success: false as const,
          error: new Error("GitHub not yet implemented"),
        };
      })
      .exhaustive();
  }

  async listPipelineJobs(id: PipelineId): Promise<Result<PipelineJob[]>> {
    return match(id)
      .with({ platform: "gitlab" }, async (gitlabId) => {
        const result = await this.gitLabService.listPipelineJobs(gitlabId);
        if (!result.success) return result;
        return {
          success: true as const,
          value: result.value.map(toGenericJob),
        };
      })
      .with({ platform: "github" }, async () => {
        const result = await this.gitHubService.listWorkflowRunJobs();
        if (!result.success) return result;
        return { success: true as const, value: [] };
      })
      .exhaustive();
  }

  async getJobLog(id: JobId): Promise<Result<string>> {
    return match(id)
      .with({ platform: "gitlab" }, (gitlabId) =>
        this.gitLabService.getJobLog(gitlabId),
      )
      .with({ platform: "github" }, async () => {
        return {
          success: false as const,
          error: new Error("GitHub not yet implemented"),
        };
      })
      .exhaustive();
  }

  async testConnection(): Promise<Result<void>> {
    return match(this.credential.forgeType)
      .with("gitlab", () => this.gitLabService.testConnection())
      .with("github", () => this.gitHubService.testConnection())
      .exhaustive();
  }
}

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

/**
 * Constructs the appropriate GitForgeService for a project's credential.
 */
export function createGitForgeService(
  credential: ForgeCredential,
): GitForgeService {
  return match(credential.forgeType)
    .with("gitlab", () => {
      const gitLabService = new GitLabServiceImpl(credential);
      return new DefaultGitForgeService(
        credential,
        gitLabService,
        new GitHubServiceImpl(),
      );
    })
    .with("github", () => {
      throw new Error("GitHub not yet implemented");
    })
    .exhaustive();
}
