import type { Database } from "../db";

/**
 * Runs `fn` with a dummy tx object. Counts how often `transaction` was entered (for assertions).
 */
export class FakeDatabase {
  transactionCount = 0;

  transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    this.transactionCount++;
    return fn({});
  };

  asDatabase(): Database {
    return this as unknown as Database;
  }
}

/**
 * Tracks whether a `transaction` callback is currently on the stack (for ordering assertions).
 */
export function createTransactionTrackingDatabase(state: {
  inTransaction: boolean;
}): {
  db: Database;
} {
  const fake = {
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      state.inTransaction = true;
      try {
        return await fn({});
      } finally {
        state.inTransaction = false;
      }
    },
  };
  return { db: fake as unknown as Database };
}
