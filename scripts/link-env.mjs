// Symlink the primary checkout's secret dotenv files into a linked worktree.
//
// Some dotenv files hold secrets and are gitignored, so they live only in the
// primary checkout and never reach the worktrees Superconductor creates. Rather
// than copy (and risk stale secrets), each worktree links back to the single
// source of truth, so editing the primary checkout's file updates every
// worktree at once.
//
// Only files that are BOTH gitignored AND not regenerated per-worktree belong
// here. `.env.local` / `.env.example` are tracked, so git already brings them
// into the worktree; `.env.portless.local` is written per-worktree by
// dev-env.mjs and must stay local — neither is linked.
//
// Run standalone via `pnpm link-env`, or automatically at the start of `pnpm
// dev` (dev-env.mjs imports `linkEnvFiles`).

import { execFile } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Gitignored secret files to link, as paths relative to the repo root. Extend
// this list when a new secret-bearing dotenv file is added to the project.
const SECRET_ENV_FILES = ["apps/server/.env"];

/**
 * Resolve the primary checkout's path, where the gitignored secrets live. The
 * common git dir is shared by every linked worktree but physically sits inside
 * the primary checkout (`<primary>/.git`), so its parent is what we want.
 */
const getPrimaryCheckout = async (cwd) => {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd, encoding: "utf8" },
  );
  return path.dirname(stdout.trim());
};

/** Create one relative symlink, leaving real files and correct links untouched. */
const linkFile = (targetPath, linkPath) => {
  const rel = path.relative(repoRoot, linkPath);

  if (!existsSync(targetPath)) {
    console.log(`[link-env] skip ${rel} — not present in the primary checkout`);
    return;
  }

  if (existsSync(linkPath) || lstatSync(linkPath, { throwIfNoEntry: false })) {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      // Already linked correctly? Leave it. Otherwise re-point it.
      const current = path.resolve(
        path.dirname(linkPath),
        readlinkSync(linkPath),
      );
      if (current === path.resolve(targetPath)) {
        console.log(`[link-env] ok   ${rel} — already linked`);
        return;
      }
      unlinkSync(linkPath);
    } else {
      // A real file here is a deliberate local override; never clobber it.
      console.log(`[link-env] skip ${rel} — a real file already exists here`);
      return;
    }
  }

  const linkTarget = path.relative(path.dirname(linkPath), targetPath);
  symlinkSync(linkTarget, linkPath);
  console.log(`[link-env] link ${rel} -> ${linkTarget}`);
};

const repoRoot = (
  await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  })
).stdout.trim();

export const linkEnvFiles = async () => {
  const primary = await getPrimaryCheckout(repoRoot);
  if (path.resolve(primary) === path.resolve(repoRoot)) {
    // This is the primary checkout itself; the real files already live here.
    return;
  }
  for (const file of SECRET_ENV_FILES) {
    linkFile(path.join(primary, file), path.join(repoRoot, file));
  }
};

// Run directly: `node scripts/link-env.mjs` / `pnpm link-env`.
if (import.meta.url === `file://${process.argv[1]}`) {
  await linkEnvFiles();
}
