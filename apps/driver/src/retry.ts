export type RetryDecision =
  | { kind: "retry"; nextAttempt: number }
  | { kind: "exhausted" };

export class RetryController {
  private attemptsSinceProgress = 0;

  constructor(private readonly retryLimit: number) {}

  recordProgress(): void {
    this.attemptsSinceProgress = 0;
  }

  recordFailure(): RetryDecision {
    if (this.attemptsSinceProgress >= this.retryLimit) {
      return { kind: "exhausted" };
    }

    this.attemptsSinceProgress += 1;
    return {
      kind: "retry",
      nextAttempt: this.attemptsSinceProgress,
    };
  }
}
