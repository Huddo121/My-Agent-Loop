import type { ProjectShortCode, TaskId } from "@mono/api";
import type { GitBranch } from "./GitRepository";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_SLUG_LENGTH = 80;
const MAX_BRANCH_LENGTH = 244;

/**
 * Stable decimal representation of a task id for branch names.
 * UUID task ids use the 128-bit value; other ids (e.g. in tests) use UTF-8 bytes.
 */
export function taskIdToNumericString(id: TaskId): string {
  if (UUID_RE.test(id)) {
    const hex = id.replace(/-/g, "");
    return BigInt(`0x${hex}`).toString();
  }
  const hex = Buffer.from(id, "utf8").toString("hex");
  return BigInt(`0x${hex}`).toString();
}

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
 * Automatic task branch: project short code (lowercase), numeric task id segment, then title slug.
 */
export function buildTaskBranchName(
  shortCode: ProjectShortCode,
  task: { id: TaskId; title: string },
): GitBranch {
  const code = shortCode.toLowerCase();
  const numericId = taskIdToNumericString(task.id);
  let slug = slugifyTaskTitle(task.title);
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  }

  const prefix = `${code}-${numericId}-`;
  let branch = `${prefix}${slug}`;
  if (branch.length > MAX_BRANCH_LENGTH) {
    const maxSlug = Math.max(1, MAX_BRANCH_LENGTH - prefix.length);
    slug = slug.slice(0, maxSlug).replace(/-+$/g, "");
    branch = `${prefix}${slug}`;
  }

  return branch as GitBranch;
}
