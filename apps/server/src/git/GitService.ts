import * as fs from "node:fs";
import * as path from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import type { AbsoluteFilePath } from "../file-system/FilePath";
import type { Result } from "../utils/Result";
import type { GitBranch, GitRepository } from "./GitRepository";

export interface CheckoutOptions {
  repositoryUrl: string;
  targetDirectory: AbsoluteFilePath;
  branch: GitBranch;
}

export interface GitService {
  /**
   * Checks out a repository for a task, creating a new branch from the primary branch.
   * The branch name will be in the format `task-${taskId}-${runId}`.
   */
  checkoutRepository(options: CheckoutOptions): Promise<Result<GitRepository>>;
  detectMainBranch(repository: GitRepository): Promise<Result<GitBranch>>;
  getRepositoryMetadata(
    targetDirectory: AbsoluteFilePath,
  ): Promise<Result<GitRepository>>;
  commitRepository(
    repository: GitRepository,
    message: string,
  ): Promise<Result<void>>;
  pushRepository(repository: GitRepository): Promise<Result<void>>;
  mergeBranchInToCurrentBranch(
    repository: GitRepository,
    branch: GitBranch,
  ): Promise<Result<void>>;
  checkoutBranch(
    repository: GitRepository,
    branch: GitBranch,
  ): Promise<Result<void>>;
}

export interface SimpleGitServiceOptions {
  /**
   * The base directory where repositories will be cloned.
   * Defaults to ".devloop/repos" relative to process.cwd().
   */
  repositoriesBasePath?: string;
}

export class SimpleGitService implements GitService {
  /**
   * Gets a SimpleGit instance for a specific repository path.
   * Uses simpleGit factory function to create instances for task-specific paths.
   */
  private getGitForPath(repoPath: string): SimpleGit {
    // Ensure the path exists before creating the simpleGit instance;
    // simple-git fails if the directory does not exist.
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }
    return simpleGit(repoPath);
  }

  /**
   * Detects the primary branch of a repository (main or master).
   * Prefers main over master. Checks remote branches first, then falls back to local branches.
   */
  private async detectPrimaryBranch(repoGit: SimpleGit): Promise<GitBranch> {
    // Check remote branches first (more reliable for determining the default branch)
    // Prefer main over master
    const remoteBranches = await repoGit.branch(["-r"]);
    if (remoteBranches.all.includes("origin/main")) {
      return "main" as GitBranch;
    }
    if (remoteBranches.all.includes("origin/master")) {
      return "master" as GitBranch;
    }

    // Fall back to local branches
    const localBranches = await repoGit.branchLocal();
    if (localBranches.all.includes("main")) {
      return "main" as GitBranch;
    }
    if (localBranches.all.includes("master")) {
      return "master" as GitBranch;
    }

    // Default to main if neither exists (new repo case)
    return "main" as GitBranch;
  }

  /**
   * Checks out a repository for a task, creating a new branch from the primary branch.
   * The branch name will be in the format `task-${taskId}-${runId}`.
   * If the repository doesn't exist, it will be cloned first.
   * If it exists, it will fetch the latest changes.
   * Returns the repository metadata on success.
   */
  async checkoutRepository(
    options: CheckoutOptions,
  ): Promise<Result<GitRepository>> {
    const { repositoryUrl, targetDirectory, branch } = options;

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(targetDirectory);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Check if the directory exists AND is a git repository
      const gitDir = path.join(targetDirectory, ".git");
      const isExistingRepo =
        fs.existsSync(targetDirectory) && fs.existsSync(gitDir);

      if (!isExistingRepo) {
        // Clone the repository using a git instance bound to the parent directory
        // This ensures git commands execute in the correct context, not the My Agent Loop repo
        const parentGit = this.getGitForPath(parentDir);
        await parentGit.clone(repositoryUrl, path.basename(targetDirectory));
        console.info("Cloned new copy of repository to ", targetDirectory);
      }

      // Now get the git instance (directory definitely exists at this point)
      const repoGit = this.getGitForPath(targetDirectory);

      if (isExistingRepo) {
        // Fetch latest changes for existing repo
        await repoGit.fetch();
        console.info(
          "Fetched latest changes from repository to ",
          targetDirectory,
        );
      }

      // Detect the primary branch (main or master)
      const primaryBranch = await this.detectPrimaryBranch(repoGit);
      console.info(`Detected primary branch: ${primaryBranch}`);

      // Checkout the primary branch and pull latest changes
      const localBranches = await repoGit.branchLocal();
      if (localBranches.current !== primaryBranch) {
        await repoGit.checkout(primaryBranch);
      }
      try {
        await repoGit.pull();
      } catch (err) {
        // Ignore pulls with no remote tracking info
        if (
          !(
            err instanceof Error &&
            err.message.includes(
              "There is no tracking information for the current branch.",
            )
          )
        ) {
          throw err;
        }
      }

      // Create a new branch from the primary branch for this task run
      // Always create a fresh branch to ensure we start from the latest primary branch
      const branchesAfterPull = await repoGit.branchLocal();
      if (branchesAfterPull.all.includes(branch)) {
        // Branch already exists, delete it first to ensure fresh start
        await repoGit.deleteLocalBranch(branch, true);
        console.info(`Deleted existing branch ${branch} for fresh start`);
      }
      await repoGit.checkout(["-b", branch]);
      console.info(`Created new branch ${branch} from ${primaryBranch}`);

      return {
        success: true,
        value: {
          branch,
          path: targetDirectory,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async detectMainBranch(
    repository: GitRepository,
  ): Promise<Result<GitBranch>> {
    const repoGit = this.getGitForPath(repository.path);
    const primaryBranch = await this.detectPrimaryBranch(repoGit);
    return { success: true, value: primaryBranch as GitBranch };
  }

  /**
   * Gets metadata about the repository for a task, including current branch and path.
   */
  async getRepositoryMetadata(
    targetDirectory: AbsoluteFilePath,
  ): Promise<Result<GitRepository>> {
    try {
      if (!fs.existsSync(targetDirectory)) {
        return {
          success: false,
          error: new Error(
            `Repository not found at '${targetDirectory}'. Call checkoutRepositoryForTask first.`,
          ),
        };
      }

      const repoGit = this.getGitForPath(targetDirectory);
      const branchSummary = await repoGit.branchLocal();
      const currentBranch = (branchSummary.current || "HEAD") as GitBranch;

      return {
        success: true,
        value: {
          branch: currentBranch,
          path: targetDirectory,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Pushes the repository for a task to its remote.
   */
  async pushRepository(repository: GitRepository): Promise<Result<void>> {
    try {
      const repoPath = repository.path;

      if (!fs.existsSync(repoPath)) {
        return {
          success: false,
          error: new Error(
            `Repository not found at '${repository.path}'. Call checkoutRepository first.`,
          ),
        };
      }

      const repoGit = this.getGitForPath(repoPath);
      const branchSummary = await repoGit.branchLocal();
      const currentBranch = branchSummary.current;

      if (!currentBranch) {
        return {
          success: false,
          error: new Error(
            `No branch checked out for repository at '${repository.path}'. Cannot push.`,
          ),
        };
      }

      // Use --set-upstream to ensure the remote tracking branch is set on first push
      await repoGit.push("origin", currentBranch, ["--set-upstream"]);

      return {
        success: true,
        value: undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async commitRepository(
    repository: GitRepository,
    message: string,
  ): Promise<Result<void>> {
    try {
      const repoPath = repository.path;
      const repoGit = this.getGitForPath(repoPath);
      await repoGit.add(".");
      await repoGit.commit(message);
      return { success: true, value: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async mergeBranchInToCurrentBranch(
    repository: GitRepository,
    branch: GitBranch,
  ): Promise<Result<void>> {
    try {
      const repoPath = repository.path;

      if (!fs.existsSync(repoPath)) {
        return {
          success: false,
          error: new Error(
            `Repository not found at '${repository.path}'. Call checkoutRepository first.`,
          ),
        };
      }

      const repoGit = this.getGitForPath(repoPath);
      const branches = await repoGit.branchLocal();
      const taskBranch = branches.current as GitBranch | undefined;

      if (!taskBranch) {
        return {
          success: false,
          error: new Error(
            `No branch checked out for repository at '${repository.path}'. Cannot merge.`,
          ),
        };
      }

      if (!branches.all.includes(branch)) {
        return {
          success: false,
          error: new Error(
            `Branch '${branch}' not found in repository at '${repository.path}'. Cannot merge.`,
          ),
        };
      }

      await repoGit.merge([branch]);

      return { success: true, value: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async checkoutBranch(
    repository: GitRepository,
    branch: GitBranch,
  ): Promise<Result<void>> {
    const repoGit = this.getGitForPath(repository.path);
    const branchSummary = await repoGit.branchLocal();
    if (branchSummary.current === branch) {
      return { success: true, value: undefined };
    }
    if (!branchSummary.all.includes(branch)) {
      await repoGit.checkoutLocalBranch(branch);
    } else {
      await repoGit.checkout(branch);
    }

    return { success: true, value: undefined };
  }
}
