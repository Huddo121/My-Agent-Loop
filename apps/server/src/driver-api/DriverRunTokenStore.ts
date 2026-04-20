import type { RunId } from "../runs/RunId";

export interface DriverRunTokenStore {
  setToken(runId: RunId, token: string): void;
  clearToken(runId: RunId): void;
  isValidToken(runId: RunId, candidateToken: string): boolean;
}

export class InMemoryDriverRunTokenStore implements DriverRunTokenStore {
  private readonly tokens = new Map<RunId, string>();

  setToken(runId: RunId, token: string): void {
    this.tokens.set(runId, token);
  }

  clearToken(runId: RunId): void {
    this.tokens.delete(runId);
  }

  isValidToken(runId: RunId, candidateToken: string): boolean {
    const expected = this.tokens.get(runId);
    if (expected === undefined) {
      return false;
    }

    return expected === candidateToken;
  }
}
