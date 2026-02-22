import type { Result } from "../../utils/Result";
import type {
  ForgeCredential,
  GitLabJobId,
  GitLabMergeRequestId,
  GitLabPipelineId,
} from "../types";
import type { GitLabService } from "./GitLabService";
import type {
  GitLabCreateMergeRequestOptions,
  GitLabJob,
  GitLabListMergeRequestOptions,
  GitLabMergeRequest,
  GitLabPipeline,
} from "./GitLabTypes";

function apiUrl(credential: ForgeCredential, path: string): string {
  const base = credential.forgeBaseUrl.replace(/\/$/, "");
  const projectEnc = encodeURIComponent(credential.projectPath);
  return `${base}/api/v4/projects/${projectEnc}${path}`;
}

function authHeader(credential: ForgeCredential): string {
  return credential.token.getSecretValue();
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
        "PRIVATE-TOKEN": authHeader(credential),
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: new Error(`GitLab API ${res.status}: ${text}`),
      };
    }
    const data = (await res.json()) as T;
    return { success: true, value: data };
  } catch (e) {
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
      headers: { "PRIVATE-TOKEN": authHeader(credential) },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        error: new Error(`GitLab API ${res.status}: ${text}`),
      };
    }
    return { success: true, value: await res.text() };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

function toMrId(iid: number): GitLabMergeRequestId {
  return { platform: "gitlab", kind: "merge-request", value: String(iid) };
}

function toPipelineId(id: number): GitLabPipelineId {
  return { platform: "gitlab", kind: "pipeline", value: String(id) };
}

function toJobId(id: number): GitLabJobId {
  return { platform: "gitlab", kind: "job", value: String(id) };
}

export class GitLabServiceImpl implements GitLabService {
  constructor(private readonly credential: ForgeCredential) {}

  async getMergeRequest(
    id: GitLabMergeRequestId,
  ): Promise<Result<GitLabMergeRequest>> {
    const url = apiUrl(this.credential, `/merge_requests/${id.value}`);
    const result = await fetchJson<RawGitLabMergeRequest>(url, this.credential);
    if (!result.success) return result;
    return {
      success: true,
      value: rawToMergeRequest(result.value),
    };
  }

  async createMergeRequest(
    options: GitLabCreateMergeRequestOptions,
  ): Promise<Result<GitLabMergeRequest>> {
    const url = apiUrl(this.credential, "/merge_requests");
    const result = await fetchJson<RawGitLabMergeRequest>(
      url,
      this.credential,
      {
        method: "POST",
        body: JSON.stringify({
          source_branch: options.sourceBranch,
          target_branch: options.targetBranch,
          title: options.title,
          description: options.description ?? "",
        }),
      },
    );
    if (!result.success) return result;
    return {
      success: true,
      value: rawToMergeRequest(result.value),
    };
  }

  async listMergeRequests(
    options?: GitLabListMergeRequestOptions,
  ): Promise<Result<GitLabMergeRequest[]>> {
    const params = new URLSearchParams();
    if (options?.state) params.set("state", options.state);
    if (options?.source_branch)
      params.set("source_branch", options.source_branch);
    if (options?.target_branch)
      params.set("target_branch", options.target_branch);
    const qs = params.toString();
    const url = apiUrl(this.credential, `/merge_requests${qs ? `?${qs}` : ""}`);
    const result = await fetchJson<RawGitLabMergeRequest[]>(
      url,
      this.credential,
    );
    if (!result.success) return result;
    return {
      success: true,
      value: result.value.map(rawToMergeRequest),
    };
  }

  async addMergeRequestNote(
    id: GitLabMergeRequestId,
    body: string,
  ): Promise<Result<void>> {
    const url = apiUrl(this.credential, `/merge_requests/${id.value}/notes`);
    const result = await fetch(url, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": authHeader(this.credential),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    });
    if (!result.ok) {
      const text = await result.text();
      return {
        success: false,
        error: new Error(`GitLab API ${result.status}: ${text}`),
      };
    }
    return { success: true, value: undefined };
  }

  async listPipelines(ref?: string): Promise<Result<GitLabPipeline[]>> {
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const url = apiUrl(this.credential, `/pipelines${qs}`);
    const result = await fetchJson<RawGitLabPipeline[]>(url, this.credential);
    if (!result.success) return result;
    return {
      success: true,
      value: result.value.map(rawToPipeline),
    };
  }

  async getPipeline(id: GitLabPipelineId): Promise<Result<GitLabPipeline>> {
    const url = apiUrl(this.credential, `/pipelines/${id.value}`);
    const result = await fetchJson<RawGitLabPipeline>(url, this.credential);
    if (!result.success) return result;
    return { success: true, value: rawToPipeline(result.value) };
  }

  async listPipelineJobs(id: GitLabPipelineId): Promise<Result<GitLabJob[]>> {
    const url = apiUrl(this.credential, `/pipelines/${id.value}/jobs`);
    const result = await fetchJson<RawGitLabJob[]>(url, this.credential);
    if (!result.success) return result;
    return {
      success: true,
      value: result.value.map(rawToJob),
    };
  }

  async getJobLog(id: GitLabJobId): Promise<Result<string>> {
    const url = apiUrl(this.credential, `/jobs/${id.value}/trace`);
    return fetchText(url, this.credential);
  }

  async testConnection(): Promise<Result<void>> {
    const url = apiUrl(this.credential, "");
    const result = await fetch(url, {
      headers: { "PRIVATE-TOKEN": authHeader(this.credential) },
    });
    if (!result.ok) {
      const text = await result.text();
      return {
        success: false,
        error: new Error(`GitLab API ${result.status}: ${text}`),
      };
    }
    return { success: true, value: undefined };
  }
}

interface RawGitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: string;
  source_branch: string;
  target_branch: string;
  web_url: string;
  labels?: string[];
}

function rawToMergeRequest(raw: RawGitLabMergeRequest): GitLabMergeRequest {
  return {
    id: toMrId(raw.iid),
    iid: raw.iid,
    project_id: raw.project_id,
    title: raw.title,
    description: raw.description,
    state: raw.state,
    source_branch: raw.source_branch,
    target_branch: raw.target_branch,
    web_url: raw.web_url,
    labels: raw.labels ?? [],
  };
}

interface RawGitLabPipeline {
  id: number;
  project_id: number;
  ref: string;
  status: string;
  web_url: string;
  created_at: string;
}

function rawToPipeline(raw: RawGitLabPipeline): GitLabPipeline {
  return {
    id: toPipelineId(raw.id),
    project_id: raw.project_id,
    ref: raw.ref,
    status: raw.status,
    web_url: raw.web_url,
    created_at: raw.created_at,
  };
}

interface RawGitLabJob {
  id: number;
  name: string;
  stage: string;
  status: string;
}

function rawToJob(raw: RawGitLabJob): GitLabJob {
  return {
    id: toJobId(raw.id),
    name: raw.name,
    stage: raw.stage,
    status: raw.status,
  };
}
