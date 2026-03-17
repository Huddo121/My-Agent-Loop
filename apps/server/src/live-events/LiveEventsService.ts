import type { LiveEventDto, LiveSubscription, WorkspaceId } from "@mono/api";

/**
 * SSEMessage shape compatible with Hono's streamSSE writeSSE.
 * Used to send both events and heartbeat keepalives.
 */
export interface SSEMessageForClient {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
}

/**
 * Function that sends an SSE message to a single client.
 * The SSE endpoint provides this when registering a connection.
 */
export type SendSSE = (message: SSEMessageForClient) => Promise<void>;

export interface LiveEventsSubscriber {
  /** Unique connection id for this subscriber */
  id: string;
  /** Workspace this connection is scoped to */
  workspaceId: WorkspaceId;
  /** Parsed subscription list from query params */
  subscriptions: LiveSubscription[];
  /** Sends an SSE message to this client */
  send: SendSSE;
  /** Optional: last event timestamp for heartbeat idle detection */
  lastEventAt?: number;
}

/**
 * Options for registering a new SSE subscriber.
 */
export interface RegisterOptions {
  workspaceId: WorkspaceId;
  subscriptions: LiveSubscription[];
  send: SendSSE;
}

/**
 * Manages in-memory SSE subscribers. Registers and unregisters connections,
 * stores each connection's workspace id and parsed subscriptions, publishes
 * only matching events, and supports heartbeats for long-lived idle streams.
 */
export class LiveEventsService {
  private subscribers = new Map<string, LiveEventsSubscriber>();
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs: number;
  private nextConnectionId = 0;

  constructor(options?: { heartbeatIntervalMs?: number }) {
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 15_000;
  }

  /**
   * Registers a new SSE connection. Returns the connection id for use in unregister.
   */
  register(options: RegisterOptions): string {
    const id = `live-${++this.nextConnectionId}-${Date.now()}`;
    const subscriber: LiveEventsSubscriber = {
      id,
      workspaceId: options.workspaceId,
      subscriptions: options.subscriptions,
      send: options.send,
      lastEventAt: Date.now(),
    };
    this.subscribers.set(id, subscriber);
    this.maybeStartHeartbeat();
    return id;
  }

  /**
   * Unregisters an SSE connection. Call on abort or disconnect.
   */
  unregister(connectionId: string): void {
    this.subscribers.delete(connectionId);
    this.maybeStopHeartbeat();
  }

  /**
   * Publishes an event to all subscribers whose workspace and subscriptions match.
   */
  async publish(workspaceId: WorkspaceId, event: LiveEventDto): Promise<void> {
    const now = Date.now();
    const matching = this.getMatchingSubscribers(workspaceId, event);

    await Promise.allSettled(
      matching.map(async (sub) => {
        try {
          sub.lastEventAt = now;
          await sub.send({
            event: event.type,
            data: JSON.stringify(event),
          });
        } catch {
          // Best-effort: if send fails, the connection is likely dead.
          // The endpoint will unregister on abort; we don't remove here
          // to avoid mutating during iteration.
        }
      }),
    );
  }

  /**
   * Sends a heartbeat/keepalive to all subscribers to prevent proxy timeouts.
   * Called periodically by the service when the heartbeat interval is enabled.
   */
  private async sendHeartbeats(): Promise<void> {
    const now = Date.now();
    const staleThreshold = this.heartbeatIntervalMs * 2;

    await Promise.allSettled(
      Array.from(this.subscribers.values()).map(async (sub) => {
        const idleMs = now - (sub.lastEventAt ?? 0);
        if (idleMs < staleThreshold) return;
        try {
          await sub.send({ event: "ping", data: "" });
          sub.lastEventAt = now;
        } catch {
          // Connection likely dead; leave for endpoint to clean up
        }
      }),
    );
  }

  private getMatchingSubscribers(
    workspaceId: WorkspaceId,
    event: LiveEventDto,
  ): LiveEventsSubscriber[] {
    const result: LiveEventsSubscriber[] = [];
    for (const sub of this.subscribers.values()) {
      if (sub.workspaceId !== workspaceId) continue;
      if (this.subscriptionMatchesEvent(sub.subscriptions, event)) {
        result.push(sub);
      }
    }
    return result;
  }

  private subscriptionMatchesEvent(
    subscriptions: LiveSubscription[],
    event: LiveEventDto,
  ): boolean {
    switch (event.type) {
      case "project.updated": {
        const projectId = event.project.id;
        return subscriptions.some((s) => {
          if (s.type === "workspace-projects") return true;
          if (s.type === "project-board" && s.projectId === projectId)
            return true;
          return false;
        });
      }
      case "task.updated": {
        const projectId = event.projectId;
        return subscriptions.some(
          (s) => s.type === "project-board" && s.projectId === projectId,
        );
      }
      default: {
        const _: never = event;
        return false;
      }
    }
  }

  private maybeStartHeartbeat(): void {
    if (this.heartbeatIntervalId !== null) return;
    if (this.subscribers.size === 0) return;
    this.heartbeatIntervalId = setInterval(() => {
      this.sendHeartbeats();
    }, this.heartbeatIntervalMs);
  }

  private maybeStopHeartbeat(): void {
    if (this.subscribers.size > 0) return;
    if (this.heartbeatIntervalId !== null) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  /** Returns the current subscriber count (for tests/metrics). */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }
}
