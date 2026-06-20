import type { ChildProcess } from "node:child_process";

/**
 * Resolves once the child process has actually spawned, and rejects with a descriptive error when
 * spawning failed (e.g. the configured binary path does not exist or is not executable).
 *
 * A failed spawn surfaces as an "error" event on the ChildProcess, emitted on a later tick. With
 * no listener attached, that is an unhandled EventEmitter error and brings down the whole server
 * process — so adapters must call this synchronously, in the same tick as spawn(), before the
 * event can fire.
 */
export function waitForProcessSpawn(
  child: ChildProcess,
  processName: string,
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    // pid is assigned synchronously when the OS-level spawn succeeds, and the "spawn" event may
    // have fired before this runs — so treat a present pid as already spawned.
    if (child.pid !== undefined) {
      resolve(child);
      return;
    }
    child.once("spawn", () => resolve(child));
    child.once("error", (error) => {
      reject(
        new Error(`Failed to spawn ${processName}: ${error.message}`, {
          cause: error,
        }),
      );
    });
  });
}
