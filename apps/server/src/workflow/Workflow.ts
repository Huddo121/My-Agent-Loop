import { match } from "ts-pattern";
import type { GitRepository } from "../git/GitRepository";
import type { GitService } from "../git/GitService";
import type { Task } from "../task-queue";
import type { Result } from "../utils/Result";

export type OnTaskCompletedAction = "push-branch" | "merge-immediately";

/** This should always be the latest version of the workflow config */
export type WorkflowConfiguration = {
  version: "1";
  onTaskCompleted: OnTaskCompletedAction;
};

const commitMessage = (task: Task) =>
  `${task.title}\n\n${task.description}\n\nTask ID: ${task.id}`;

const commitAndPushThenMergeToMaster =
  (gitService: GitService) =>
  async (
    task: Task,
    repository: GitRepository,
  ): Promise<Result<void, Error>> => {
    const workBranch = repository.branch;
    const commitResult = await gitService.commitRepository(
      repository,
      commitMessage(task),
    );
    if (commitResult.success === false) {
      console.error(
        `Failed to commit task ${task.id}:`,
        commitResult.error.message,
      );
      return { success: false, error: commitResult.error };
    }

    await gitService.pushRepository(repository);
    const mainBranch = await gitService.detectMainBranch(repository);
    if (mainBranch.success === false) {
      return { success: false, error: mainBranch.error };
    }

    const checkoutResult = await gitService.checkoutBranch(
      repository,
      mainBranch.value,
    );
    if (checkoutResult.success === false) {
      return { success: false, error: checkoutResult.error };
    }

    const mergeResult = await gitService.mergeBranchInToCurrentBranch(
      repository,
      workBranch,
    );
    if (mergeResult.success === false) {
      return { success: false, error: mergeResult.error };
    }

    const pushResult = await gitService.pushRepository(repository);

    if (pushResult.success === false) {
      console.error(
        `Failed to merge and push task ${task.id}:`,
        pushResult.error.message,
      );
      return {
        success: false,
        error: new Error(
          `Could not merge code change: ${pushResult.error.message}`,
        ),
      };
    }

    return { success: true, value: undefined };
  };

const pushBranch =
  (gitService: GitService) =>
  async (
    task: Task,
    repository: GitRepository,
  ): Promise<Result<void, Error>> => {
    // Commit the work
    const commitResult = await gitService.commitRepository(
      repository,
      commitMessage(task),
    );
    if (commitResult.success === false) {
      return { success: false, error: commitResult.error };
    }
    // Push it
    const pushResult = await gitService.pushRepository(repository);
    return pushResult;
  };

export interface Workflow {
  onTaskCompleted(
    task: Task,
    repository: GitRepository,
  ): Promise<Result<void, Error>>;
}

/**
 * For the workflow config, construct the set of callbacks to properly drive that workflow
 */
export const realiseWorkflowConfiguration = (
  workflowConfig: WorkflowConfiguration,
  services: { gitService: GitService },
): Workflow => {
  const onTaskCompleted = match(workflowConfig.onTaskCompleted)
    .with("push-branch", () => pushBranch(services.gitService))
    .with("merge-immediately", () =>
      commitAndPushThenMergeToMaster(services.gitService),
    )
    .exhaustive();

  return { onTaskCompleted };
};
