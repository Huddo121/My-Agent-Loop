import type { Logger } from "../logger/Logger";

/**
 * Collects log calls as structured data for assertions (replaces interaction-style mocks).
 */
export class CapturingLogger implements Logger {
  readonly errors: Array<[string, Record<string, unknown> | undefined]> = [];
  readonly warns: Array<[string, Record<string, unknown> | undefined]> = [];
  readonly infos: Array<[string, Record<string, unknown> | undefined]> = [];
  readonly debugs: Array<[string, Record<string, unknown> | undefined]> = [];

  error(message: string, data?: Record<string, unknown>): void {
    this.errors.push([message, data]);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.warns.push([message, data]);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.infos.push([message, data]);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.debugs.push([message, data]);
  }
}
