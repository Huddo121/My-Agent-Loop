import {
  type RunId as RunIdDto,
  runIdSchema as runIdDtoSchema,
} from "@mono/api";
import type { Branded } from "../utils/Branded";

/**
 * Identifier for a specific run of the system.
 * Every time a workflow is started, it will get a new, random `RunId`.
 */
export type RunId = Branded<string, "RunId">;

export const asRunIdDto = (runId: RunId): RunIdDto =>
  runIdDtoSchema.parse(runId);

/**
 * Generates a new random RunId.
 * The ID is a short alphanumeric string suitable for use in branch names.
 */
export function generateRunId(): RunId {
  // Generate a random 16-character alphanumeric string
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result as RunId;
}
