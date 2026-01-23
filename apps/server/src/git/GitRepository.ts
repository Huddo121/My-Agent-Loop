import type { AbsoluteFilePath } from "../file-system/FilePath";
import type { Branded } from "../utils/Branded";

export type GitBranch = Branded<string, "GitBranch">;

export interface GitRepository {
  branch: GitBranch;
  path: AbsoluteFilePath;
}
