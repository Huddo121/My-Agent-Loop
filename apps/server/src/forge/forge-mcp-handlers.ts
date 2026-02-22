import z from "zod";
import { getMcpServices } from "../utils/mcp-service-context";
import type { McpTool, McpTools } from "../utils/mcp-tool";
import { withNewTransaction } from "../utils/transaction-context";
import {
  createGitForgeService,
  getProjectPathFromRepositoryUrl,
} from "./GitForgeService";
import type { JobId, MergeRequestId, PipelineId } from "./types";

function parseForgeId(
  platform: "gitlab" | "github",
  kind: "merge-request" | "pipeline" | "job",
  value: string,
): MergeRequestId | PipelineId | JobId {
  return { platform, kind, value } as MergeRequestId | PipelineId | JobId;
}

const createMergeRequestParamsSchema = z.object({
  sourceBranch: z.string().describe("Source branch name"),
  targetBranch: z.string().describe("Target branch name (e.g. main)"),
  title: z.string().describe("MR/PR title"),
  description: z.string().optional().describe("MR/PR description"),
});
const getMergeRequestParamsSchema = z.object({
  platform: z.enum(["gitlab", "github"]),
  id: z.string().describe("MR/PR identifier (e.g. IID for GitLab)"),
});
const listMergeRequestsParamsSchema = z
  .object({
    state: z
      .enum(["opened", "closed", "merged", "all"])
      .optional()
      .describe("Filter by state"),
  })
  .optional();
const addMergeRequestCommentParamsSchema = z.object({
  platform: z.enum(["gitlab", "github"]),
  id: z.string(),
  body: z.string().describe("Comment text"),
});
const listCiPipelinesParamsSchema = z.object({
  ref: z.string().optional().describe("Branch or tag name"),
});
const getCiPipelineParamsSchema = z.object({
  platform: z.enum(["gitlab", "github"]),
  id: z.string(),
});
const listCiPipelineJobsParamsSchema = z.object({
  platform: z.enum(["gitlab", "github"]),
  pipelineId: z.string(),
});
const getCiJobLogParamsSchema = z.object({
  platform: z.enum(["gitlab", "github"]),
  jobId: z.string(),
});

async function getGitForgeServiceOrError(
  projectId: string,
): Promise<
  | { success: true; service: ReturnType<typeof createGitForgeService> }
  | { success: false; error: string }
> {
  const services = getMcpServices();

  const project = await withNewTransaction(services.db, async () =>
    services.projectsService.getProject(
      projectId as import("@mono/api").ProjectId,
    ),
  );
  if (project === undefined) {
    return { success: false, error: "Project not found" };
  }
  if (project.forgeType === null || project.forgeBaseUrl === null) {
    return {
      success: false,
      error: "Project does not have forge (GitLab/GitHub) configured.",
    };
  }

  const secret = await withNewTransaction(services.db, async () =>
    services.forgeSecretRepository.getForgeSecret(
      projectId as import("@mono/api").ProjectId,
    ),
  );
  if (secret === undefined) {
    return {
      success: false,
      error: "Project has no forge token configured.",
    };
  }

  const projectPath = getProjectPathFromRepositoryUrl(project.repositoryUrl);
  const service = createGitForgeService({
    forgeType: project.forgeType,
    forgeBaseUrl: project.forgeBaseUrl,
    token: secret,
    projectPath,
  });
  return { success: true, service };
}

async function withForgeService<T>(
  projectId: string,
  fn: (service: ReturnType<typeof createGitForgeService>) => Promise<T>,
): Promise<string> {
  const result = await getGitForgeServiceOrError(projectId);
  if (!result.success) {
    return JSON.stringify({ error: result.error });
  }
  try {
    const value = await fn(result.service);
    return JSON.stringify(value);
  } catch (e) {
    return JSON.stringify({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export const createMergeRequestMcpHandler = {
  name: "create_merge_request",
  description:
    "Create a merge request (MR) or pull request (PR) for the current branch",
  parameters: createMergeRequestParamsSchema,
  execute: async (params: unknown, { session }) => {
    if (session?.projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }
    const p = createMergeRequestParamsSchema.parse(params);
    return withForgeService(session.projectId, async (service) => {
      const result = await service.createMergeRequest({
        sourceBranch: p.sourceBranch,
        targetBranch: p.targetBranch,
        title: p.title,
        description: p.description,
      });
      if (!result.success) throw result.error;
      return result.value;
    });
  },
} satisfies McpTool;

export const getMergeRequestMcpHandler = {
  name: "get_merge_request",
  description: "Get merge request / pull request details by ID",
  parameters: getMergeRequestParamsSchema,
  execute: async (params: unknown, { session }) => {
    if (session?.projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }
    const p = getMergeRequestParamsSchema.parse(params);
    const mrId = parseForgeId(
      p.platform,
      "merge-request",
      p.id,
    ) as MergeRequestId;
    return withForgeService(session.projectId, async (service) => {
      const result = await service.getMergeRequest(mrId);
      if (!result.success) throw result.error;
      return result.value;
    });
  },
} satisfies McpTool;

export const listMergeRequestsMcpHandler = {
  name: "list_merge_requests",
  description: "List merge requests / pull requests for the project",
  parameters: listMergeRequestsParamsSchema,
  execute: async (params: unknown, { session }) => {
    if (session?.projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }
    const opts =
      params !== undefined && params !== null
        ? listMergeRequestsParamsSchema.parse(params)
        : undefined;
    return withForgeService(session.projectId, async (service) => {
      const result = await service.listMergeRequests(opts);
      if (!result.success) throw result.error;
      return result.value;
    });
  },
} satisfies McpTool;

export const addMergeRequestCommentMcpHandler = {
  name: "add_merge_request_comment",
  description: "Add a comment to a merge request / pull request",
  parameters: addMergeRequestCommentParamsSchema,
  execute: async (params: unknown, { session }) => {
    if (session?.projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }
    const p = addMergeRequestCommentParamsSchema.parse(params);
    const mrId = parseForgeId(
      p.platform,
      "merge-request",
      p.id,
    ) as MergeRequestId;
    return withForgeService(session.projectId, async (service) => {
      const result = await service.addMergeRequestComment(mrId, p.body);
      if (!result.success) throw result.error;
      return undefined;
    });
  },
} satisfies McpTool;

export const listCiPipelinesMcpHandler = {
  name: "list_ci_pipelines",
  description: "List CI pipelines for a ref (branch/tag)",
  parameters: listCiPipelinesParamsSchema,
  execute: async (params: unknown, { session }) => {
    if (session?.projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }
    const p = listCiPipelinesParamsSchema.parse(params);
    return withForgeService(session.projectId, async (service) => {
      const result = await service.listPipelines(p.ref);
      if (!result.success) throw result.error;
      return result.value;
    });
  },
} satisfies McpTool;

export const getCiPipelineMcpHandler = {
  name: "get_ci_pipeline",
  description: "Get CI pipeline details by ID",
  parameters: getCiPipelineParamsSchema,
  execute: async (params: unknown, { session }) => {
    if (session?.projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }
    const p = getCiPipelineParamsSchema.parse(params);
    const pipelineId = parseForgeId(p.platform, "pipeline", p.id) as PipelineId;
    return withForgeService(session.projectId, async (service) => {
      const result = await service.getPipeline(pipelineId);
      if (!result.success) throw result.error;
      return result.value;
    });
  },
} satisfies McpTool;

export const listCiPipelineJobsMcpHandler = {
  name: "list_ci_pipeline_jobs",
  description: "List jobs in a CI pipeline",
  parameters: listCiPipelineJobsParamsSchema,
  execute: async (params: unknown, { session }) => {
    if (session?.projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }
    const p = listCiPipelineJobsParamsSchema.parse(params);
    const pipelineId = parseForgeId(
      p.platform,
      "pipeline",
      p.pipelineId,
    ) as PipelineId;
    return withForgeService(session.projectId, async (service) => {
      const result = await service.listPipelineJobs(pipelineId);
      if (!result.success) throw result.error;
      return result.value;
    });
  },
} satisfies McpTool;

export const getCiJobLogMcpHandler = {
  name: "get_ci_job_log",
  description: "Get the log output of a specific CI job",
  parameters: getCiJobLogParamsSchema,
  execute: async (params: unknown, { session }) => {
    if (session?.projectId === undefined) {
      return JSON.stringify({
        error: "Project ID not provided. X-MAL-Project-ID header is required.",
      });
    }
    const p = getCiJobLogParamsSchema.parse(params);
    const jobId = parseForgeId(p.platform, "job", p.jobId) as JobId;
    return withForgeService(session.projectId, async (service) => {
      const result = await service.getJobLog(jobId);
      if (!result.success) throw result.error;
      return result.value;
    });
  },
} satisfies McpTool;

export const forgeMcpTools = [
  createMergeRequestMcpHandler,
  getMergeRequestMcpHandler,
  listMergeRequestsMcpHandler,
  addMergeRequestCommentMcpHandler,
  listCiPipelinesMcpHandler,
  getCiPipelineMcpHandler,
  listCiPipelineJobsMcpHandler,
  getCiJobLogMcpHandler,
] as McpTools;
