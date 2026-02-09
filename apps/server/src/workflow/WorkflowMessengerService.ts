import type { ProjectId } from "@mono/api";
import type { RunId } from "../runs/RunId";

type RunCompletedCallback = (
  projectId: ProjectId,
  runId: RunId,
) => Promise<void>;
type RunFailedCallback = (projectId: ProjectId, runId: RunId) => Promise<void>;

/**
 * This facilitates synchronous communication between the {@link WorkflowManager} and the {@link BackgroundWorkflowProcessor}.
 * Since both services need to communicate with each other they either need to lazily given a reference to each other
 *   or go via an intermediary. This is that intermediary.
 *
 * Services that are interested in reacting to certain events can add an event handler for the appropriate event.
 *
 * They _could_ communicate via a queue, but that seemed like overkill for a simple synchronous communication, and introduces
 *   failure modes I'd rather not think about.
 */
export class WorkflowMessengerService {
  private readonly runCompletedCallbacks: RunCompletedCallback[] = [];
  private readonly runFailedCallbacks: RunFailedCallback[] = [];

  triggerRunCompleted(projectId: ProjectId, runId: RunId): void {
    for (const callback of this.runCompletedCallbacks) {
      callback(projectId, runId);
    }
  }

  onRunCompleted(callback: RunCompletedCallback): void {
    this.runCompletedCallbacks.push(callback);
  }

  triggerRunFailed(projectId: ProjectId, runId: RunId): void {
    for (const callback of this.runFailedCallbacks) {
      callback(projectId, runId);
    }
  }

  onRunFailed(callback: RunFailedCallback): void {
    this.runFailedCallbacks.push(callback);
  }
}
