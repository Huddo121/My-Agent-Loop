import type { ProjectId, ProjectShortCode } from "@mono/api";

export type Project = {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
};

export type NewProject = {
  name: string;
  shortCode: ProjectShortCode;
  repositoryUrl: string;
};
