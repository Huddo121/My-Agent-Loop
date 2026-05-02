import type { RunQueueJobPayload } from "../workflow/workflow-queues";

/**
 * BullMQ `runQueue.add` double that records payloads and transaction state for workflow tests.
 */
export function createFakeWorkflowRunQueue(transactionState: {
  inTransaction: boolean;
}): {
  runQueue: {
    add: (key: string, payload: RunQueueJobPayload) => Promise<{ id: string }>;
  };
  queueAddTransactionStates: boolean[];
  adds: Array<{ key: string; payload: RunQueueJobPayload }>;
} {
  const queueAddTransactionStates: boolean[] = [];
  const adds: Array<{ key: string; payload: RunQueueJobPayload }> = [];
  const runQueue = {
    add: async (key: string, payload: RunQueueJobPayload) => {
      queueAddTransactionStates.push(transactionState.inTransaction);
      adds.push({ key, payload });
      return { id: "job-1" };
    },
  };
  return { runQueue, queueAddTransactionStates, adds };
}
