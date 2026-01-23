import { AsyncLocalStorage } from "node:async_hooks";
import type { Database, Tx } from "../db";

const transactionContext = new AsyncLocalStorage<Tx>();

export const getTransaction = () => {
  const tx = transactionContext.getStore();
  if (tx === undefined) {
    throw new Error(
      "Application configuration error: Transaction context not found",
    );
  }
  return tx;
};

export const withNewTransaction = async <T>(
  db: Database,
  fn: () => Promise<T>,
): Promise<T> => {
  return db.transaction(async (tx) => {
    return transactionContext.run(tx, () => fn());
  });
};
