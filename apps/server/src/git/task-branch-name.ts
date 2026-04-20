import type { ProjectShortCode, TaskNumber } from "@mono/api";
import type { GitBranch } from "./GitRepository";

const MAX_SLUG_LENGTH = 80;
const MAX_BRANCH_LENGTH = 244;

/**
 * Lowercase slug with non-alphanumeric characters removed (replaced by dashes).
 */
export function slugifyTaskTitle(title: string): string {
  const withoutAccents = title.normalize("NFKD").replace(/\p{M}/gu, "");
  const slug = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "task";
}

/**
 * Automatic task branch: project short code (lowercase), task number, then title slug.
 */
export function buildTaskBranchName(
  shortCode: ProjectShortCode,
  task: { taskNumber: TaskNumber; title: string },
): GitBranch {
  const code = shortCode.toLowerCase();
  let slug = slugifyTaskTitle(task.title);
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  }

  const prefix = `${code}-${task.taskNumber}-`;
  let branch = `${prefix}${slug}`;
  if (branch.length > MAX_BRANCH_LENGTH) {
    const maxSlug = Math.max(1, MAX_BRANCH_LENGTH - prefix.length);
    slug = slug.slice(0, maxSlug).replace(/-+$/g, "");
    branch = `${prefix}${slug}`;
  }

  return branch as GitBranch;
}
