import { match } from "ts-pattern";
import type { GitForgeService } from "../forge";
import type { GitRepository } from "../git/GitRepository";
import type { GitService } from "../git/GitService";
import type { Task } from "../task-queue";
import type { Result } from "../utils/Result";

export type OnTaskCompletedAction =
  | "push-branch"
  | "merge-immediately"
  | "push-branch-and-create-mr";

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

    const pushResult = await gitService.pushRepository(repository);
    if (pushResult.success === false) {
      return { success: false, error: pushResult.error };
    }
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

    const mergePushResult = await gitService.pushRepository(repository);

    if (mergePushResult.success === false) {
      console.error(
        `Failed to merge and push task ${task.id}:`,
        mergePushResult.error.message,
      );
      return {
        success: false,
        error: new Error(
          `Could not merge code change: ${mergePushResult.error.message}`,
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
    const commitResult = await gitService.commitRepository(
      repository,
      commitMessage(task),
    );
    if (commitResult.success === false) {
      return { success: false, error: commitResult.error };
    }
    const pushResult = await gitService.pushRepository(repository);
    return pushResult;
  };

const pushBranchAndCreateMr =
  (gitService: GitService, gitForgeService: GitForgeService) =>
  async (
    task: Task,
    repository: GitRepository,
  ): Promise<Result<void, Error>> => {
    const commitResult = await gitService.commitRepository(
      repository,
      commitMessage(task),
    );
    if (commitResult.success === false) {
      return { success: false, error: commitResult.error };
    }
    const pushResult = await gitService.pushRepository(repository);
    if (pushResult.success === false) {
      return { success: false, error: pushResult.error };
    }
    const mainBranchResult = await gitService.detectMainBranch(repository);
    if (mainBranchResult.success === false) {
      return { success: false, error: mainBranchResult.error };
    }
    const mainBranch = mainBranchResult.value;
    const createMrResult = await gitForgeService.createMergeRequest({
      sourceBranch: repository.branch,
      targetBranch: mainBranch,
      title: task.title,
      description: task.description,
    });
    if (createMrResult.success === false) {
      return { success: false, error: createMrResult.error };
    }
    return { success: true, value: undefined };
  };

export interface Workflow {
  onTaskCompleted(
    task: Task,
    repository: GitRepository,
  ): Promise<Result<void, Error>>;
}

export interface WorkflowServices {
  gitService: GitService;
  gitForgeService: GitForgeService;
}

/**
 * For the workflow config, construct the set of callbacks to properly drive that workflow
 */
export const realiseWorkflowConfiguration = (
  workflowConfig: WorkflowConfiguration,
  services: WorkflowServices,
): Workflow => {
  const onTaskCompleted = match(workflowConfig.onTaskCompleted)
    .with("push-branch", () => pushBranch(services.gitService))
    .with("merge-immediately", () =>
      commitAndPushThenMergeToMaster(services.gitService),
    )
    .with("push-branch-and-create-mr", () =>
      pushBranchAndCreateMr(services.gitService, services.gitForgeService),
    )
    .exhaustive();

  return { onTaskCompleted };
};
