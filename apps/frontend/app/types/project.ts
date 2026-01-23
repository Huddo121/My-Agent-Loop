import type { ProjectId, ProjectShortCode } from "@mono/api";

export type Project = {
  id: ProjectId;
  name: string;
  shortCode: ProjectShortCode;
};

export type NewProject = {
  name: string;
  shortCode: ProjectShortCode;
};
