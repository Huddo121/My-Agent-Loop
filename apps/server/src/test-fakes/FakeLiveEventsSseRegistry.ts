import type { WorkspaceId } from "@mono/api";
import type { RegisterOptions } from "../live-events/LiveEventsService";

/**
 * Minimal in-memory double for SSE registration used by `handleLiveEvents` tests.
 * Implements the subset of {@link LiveEventsService} those tests rely on.
 */
export class FakeLiveEventsSseRegistry {
  readonly registrations: RegisterOptions[] = [];
  readonly unregisteredIds: string[] = [];
  private nextId = 0;

  register(options: RegisterOptions): string {
    this.registrations.push(options);
    this.nextId++;
    return `conn-${this.nextId}`;
  }

  unregister(connectionId: string): void {
    this.unregisteredIds.push(connectionId);
  }

  getSubscriberCount(): number {
    return this.registrations.length - this.unregisteredIds.length;
  }

  async publish(_workspaceId: WorkspaceId, _event: unknown): Promise<void> {
    // Not used by the SSE route tests; keep for structural compatibility when needed.
  }
}
