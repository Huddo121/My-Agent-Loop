import type { LiveEventDto, WorkspaceId } from "@mono/api";

/**
 * Records `publish` calls for assertions. No real subscribers.
 */
export class RecordingLiveEventsService {
  readonly publishes: Array<{
    workspaceId: WorkspaceId;
    event: LiveEventDto;
  }> = [];

  async publish(workspaceId: WorkspaceId, event: LiveEventDto): Promise<void> {
    this.publishes.push({ workspaceId, event });
  }
}
