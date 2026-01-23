import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsoluteFilePath } from "../file-system/FilePath";

/**
 * Resolves a file path relative to the current file's directory to an absolute path.
 * Designed for ES modules (uses `import.meta.url`).
 *
 * @param importMetaUrl - The `import.meta.url` from the calling file
 * @param relativePath - Path relative to the current file's directory
 * @returns Absolute path to the file
 *
 * @example
 * ```ts
 * const scriptPath = absolutePath(import.meta.url, "lifecycle.sh");
 * const configPath = absolutePath(import.meta.url, "../config/settings.json");
 * ```
 */
export function absolutePath(
  importMetaUrl: string | URL,
  relativePath: string,
): AbsoluteFilePath {
  const currentFile = fileURLToPath(importMetaUrl);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, relativePath) as AbsoluteFilePath;
}
