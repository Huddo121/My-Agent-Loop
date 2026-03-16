import { timingSafeEqual } from "node:crypto";
import type { RunId } from "../runs/RunId";

export interface DriverRunTokenStore {
  setToken(runId: RunId, token: string): void;
  clearToken(runId: RunId): void;
  isValidToken(runId: RunId, candidateToken: string): boolean;
}

export class InMemoryDriverRunTokenStore implements DriverRunTokenStore {
  private readonly tokens = new Map<RunId, Buffer>();

  setToken(runId: RunId, token: string): void {
    this.tokens.set(runId, Buffer.from(token, "utf8"));
  }

  clearToken(runId: RunId): void {
    this.tokens.delete(runId);
  }

  isValidToken(runId: RunId, candidateToken: string): boolean {
    const expected = this.tokens.get(runId);
    if (expected === undefined) {
      return false;
    }

    const actual = Buffer.from(candidateToken, "utf8");
    if (expected.length !== actual.length) {
      return false;
    }

    return timingSafeEqual(expected, actual);
  }
}
