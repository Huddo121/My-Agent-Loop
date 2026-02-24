import type { Result } from "../../utils/Result";
import type {
  GitLabJobId,
  GitLabMergeRequestId,
  GitLabPipelineId,
} from "../types";
import type {
  GitLabCreateMergeRequestOptions,
  GitLabJob,
  GitLabListMergeRequestOptions,
  GitLabMergeRequest,
  GitLabPipeline,
} from "./GitLabTypes";

export interface GitLabService {
  getMergeRequest(
    id: GitLabMergeRequestId,
  ): Promise<Result<GitLabMergeRequest>>;
  createMergeRequest(
    options: GitLabCreateMergeRequestOptions,
  ): Promise<Result<GitLabMergeRequest>>;
  listMergeRequests(
    options?: GitLabListMergeRequestOptions,
  ): Promise<Result<GitLabMergeRequest[]>>;
  addMergeRequestNote(
    id: GitLabMergeRequestId,
    body: string,
  ): Promise<Result<void>>;

  listPipelines(ref?: string): Promise<Result<GitLabPipeline[]>>;
  getPipeline(id: GitLabPipelineId): Promise<Result<GitLabPipeline>>;
  listPipelineJobs(id: GitLabPipelineId): Promise<Result<GitLabJob[]>>;
  getJobLog(id: GitLabJobId): Promise<Result<string>>;

  testConnection(): Promise<Result<void>>;
}
