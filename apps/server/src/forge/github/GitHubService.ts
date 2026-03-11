import type { Result } from "../../utils/Result";
import type {
  ForgeCredential,
  GitHubJobId,
  GitHubPullRequestId,
  GitHubWorkflowRunId,
} from "../types";
import type {
  GitHubCreatePullRequestOptions,
  GitHubJob,
  GitHubListPullRequestOptions,
  GitHubPullRequest,
  GitHubWorkflowRun,
} from "./GitHubTypes";

export interface GitHubService {
  getPullRequest(id: GitHubPullRequestId): Promise<Result<GitHubPullRequest>>;
  createPullRequest(
    options: GitHubCreatePullRequestOptions,
  ): Promise<Result<GitHubPullRequest>>;
  listPullRequests(
    options?: GitHubListPullRequestOptions,
  ): Promise<Result<GitHubPullRequest[]>>;
  addPullRequestComment(
    id: GitHubPullRequestId,
    body: string,
  ): Promise<Result<void>>;

  listWorkflowRuns(ref?: string): Promise<Result<GitHubWorkflowRun[]>>;
  getWorkflowRun(id: GitHubWorkflowRunId): Promise<Result<GitHubWorkflowRun>>;
  listWorkflowRunJobs(id: GitHubWorkflowRunId): Promise<Result<GitHubJob[]>>;
  getJobLog(id: GitHubJobId): Promise<Result<string>>;

  testConnection(): Promise<Result<void>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiBaseUrl(credential: ForgeCredential): string {
  const base = credential.forgeBaseUrl.replace(/\/$/, "");
  if (base === "https://github.com") {
    return "https://api.github.com";
  }
  // GitHub Enterprise Server
  return `${base}/api/v3`;
}

function repoUrl(credential: ForgeCredential, path: string): string {
  const base = apiBaseUrl(credential);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}/repos/${credential.projectPath}${suffix}`;
}

function authHeaders(credential: ForgeCredential): Record<string, string> {
  return {
    Authorization: `Bearer ${credential.token.getSecretValue()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchJson<T>(
  url: string,
  credential: ForgeCredential,
  init?: RequestInit,
): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...authHeaders(credential),
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("GitHub API error when fetching JSON", {
        url,
        status: res.status,
        text,
      });
      return {
        success: false,
        error: new Error(`GitHub API ${res.status}: ${text}`),
      };
    }
    const data = (await res.json()) as T;
    return { success: true, value: data };
  } catch (e) {
    console.error("GitHub API error when fetching JSON", { url, error: e });
    return {
      success: false,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

async function fetchText(
  url: string,
  credential: ForgeCredential,
): Promise<Result<string>> {
  try {
    const res = await fetch(url, {
      headers: authHeaders(credential),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("GitHub API error when fetching text", {
        url,
        status: res.status,
        text,
      });
      return {
        success: false,
        error: new Error(`GitHub API ${res.status}: ${text}`),
      };
    }
    return { success: true, value: await res.text() };
  } catch (e) {
    console.error("GitHub API error when fetching text", { url, error: e });
    return {
      success: false,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

// ---------------------------------------------------------------------------
// Raw API response types -> domain mappers
// ---------------------------------------------------------------------------

interface RawGitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  /** Present on single-PR responses; absent on list responses */
  merged?: boolean;
  merged_at: string | null;
  head: { ref: string };
  base: { ref: string };
  html_url: string;
  labels: Array<{ name: string }>;
}

function toPrId(prNumber: number): GitHubPullRequestId {
  return { platform: "github", kind: "pull-request", value: String(prNumber) };
}

function toWorkflowRunId(id: number): GitHubWorkflowRunId {
  return { platform: "github", kind: "workflow-run", value: String(id) };
}

function toJobId(id: number): GitHubJobId {
  return { platform: "github", kind: "job", value: String(id) };
}

function rawToPullRequest(raw: RawGitHubPullRequest): GitHubPullRequest {
  const merged = raw.merged ?? raw.merged_at !== null;
  return {
    id: toPrId(raw.number),
    number: raw.number,
    title: raw.title,
    body: raw.body,
    state: merged ? "merged" : raw.state,
    merged,
    source_branch: raw.head.ref,
    target_branch: raw.base.ref,
    html_url: raw.html_url,
    labels: raw.labels.map((l) => l.name),
  };
}

interface RawGitHubWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
}

function workflowRunStatus(raw: RawGitHubWorkflowRun): string {
  if (raw.status === "completed" && raw.conclusion) {
    return raw.conclusion;
  }
  return raw.status;
}

function rawToWorkflowRun(raw: RawGitHubWorkflowRun): GitHubWorkflowRun {
  return {
    id: toWorkflowRunId(raw.id),
    name: raw.name,
    head_branch: raw.head_branch,
    status: workflowRunStatus(raw),
    html_url: raw.html_url,
    created_at: raw.created_at,
  };
}

interface RawGitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

function jobStatus(raw: RawGitHubJob): string {
  if (raw.status === "completed" && raw.conclusion) {
    return raw.conclusion;
  }
  return raw.status;
}

function rawToJob(raw: RawGitHubJob): GitHubJob {
  return {
    id: toJobId(raw.id),
    name: raw.name,
    status: jobStatus(raw),
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class GitHubServiceImpl implements GitHubService {
  constructor(private readonly credential: ForgeCredential) {}

  async getPullRequest(
    id: GitHubPullRequestId,
  ): Promise<Result<GitHubPullRequest>> {
    const url = repoUrl(this.credential, `/pulls/${id.value}`);
    const result = await fetchJson<RawGitHubPullRequest>(url, this.credential);
    if (!result.success) return result;
    return { success: true, value: rawToPullRequest(result.value) };
  }

  async createPullRequest(
    options: GitHubCreatePullRequestOptions,
  ): Promise<Result<GitHubPullRequest>> {
    const url = repoUrl(this.credential, "/pulls");
    const result = await fetchJson<RawGitHubPullRequest>(url, this.credential, {
      method: "POST",
      body: JSON.stringify({
        head: options.sourceBranch,
        base: options.targetBranch,
        title: options.title,
        body: options.description ?? "",
      }),
    });
    if (!result.success) return result;
    return { success: true, value: rawToPullRequest(result.value) };
  }

  async listPullRequests(
    options?: GitHubListPullRequestOptions,
  ): Promise<Result<GitHubPullRequest[]>> {
    const params = new URLSearchParams();
    if (options?.state) params.set("state", options.state);
    if (options?.head) params.set("head", options.head);
    if (options?.base) params.set("base", options.base);
    const qs = params.toString();
    const url = repoUrl(this.credential, `/pulls${qs ? `?${qs}` : ""}`);
    const result = await fetchJson<RawGitHubPullRequest[]>(
      url,
      this.credential,
    );
    if (!result.success) return result;
    return { success: true, value: result.value.map(rawToPullRequest) };
  }

  async addPullRequestComment(
    id: GitHubPullRequestId,
    body: string,
  ): Promise<Result<void>> {
    const url = repoUrl(this.credential, `/issues/${id.value}/comments`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...authHeaders(this.credential),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("GitHub API error when adding PR comment", {
          url,
          status: res.status,
          text,
        });
        return {
          success: false,
          error: new Error(`GitHub API ${res.status}: ${text}`),
        };
      }
      console.info("Added pull request comment", {
        url,
        forge: "github",
        id: id.value,
      });
      return { success: true, value: undefined };
    } catch (e) {
      console.error("GitHub API error when adding PR comment", {
        url,
        error: e,
      });
      return {
        success: false,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }

  async listWorkflowRuns(ref?: string): Promise<Result<GitHubWorkflowRun[]>> {
    const params = new URLSearchParams();
    if (ref) params.set("branch", ref);
    const qs = params.toString();
    const url = repoUrl(this.credential, `/actions/runs${qs ? `?${qs}` : ""}`);
    const result = await fetchJson<{ workflow_runs: RawGitHubWorkflowRun[] }>(
      url,
      this.credential,
    );
    if (!result.success) return result;
    return {
      success: true,
      value: result.value.workflow_runs.map(rawToWorkflowRun),
    };
  }

  async getWorkflowRun(
    id: GitHubWorkflowRunId,
  ): Promise<Result<GitHubWorkflowRun>> {
    const url = repoUrl(this.credential, `/actions/runs/${id.value}`);
    const result = await fetchJson<RawGitHubWorkflowRun>(url, this.credential);
    if (!result.success) return result;
    return { success: true, value: rawToWorkflowRun(result.value) };
  }

  async listWorkflowRunJobs(
    id: GitHubWorkflowRunId,
  ): Promise<Result<GitHubJob[]>> {
    const url = repoUrl(this.credential, `/actions/runs/${id.value}/jobs`);
    const result = await fetchJson<{ jobs: RawGitHubJob[] }>(
      url,
      this.credential,
    );
    if (!result.success) return result;
    return { success: true, value: result.value.jobs.map(rawToJob) };
  }

  async getJobLog(id: GitHubJobId): Promise<Result<string>> {
    const url = repoUrl(this.credential, `/actions/jobs/${id.value}/logs`);
    return fetchText(url, this.credential);
  }

  async testConnection(): Promise<Result<void>> {
    const base = apiBaseUrl(this.credential);
    const url = `${base}/repos/${this.credential.projectPath}`;
    try {
      const res = await fetch(url, {
        headers: authHeaders(this.credential),
      });
      if (!res.ok) {
        const text = await res.text();
        console.info("GitHub API test failed", {
          url,
          status: res.status,
          text,
        });
        return {
          success: false,
          error: new Error(`GitHub API ${res.status}: ${text}`),
        };
      }
      console.info("GitHub API test succeeded", { url, forge: "github" });
      return { success: true, value: undefined };
    } catch (e) {
      console.error("GitHub API test connection error", { url, error: e });
      return {
        success: false,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }
}
