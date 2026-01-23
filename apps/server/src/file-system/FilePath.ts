import path from "node:path";
import type { Branded } from "../utils/Branded";

/** A path to a file or directory */
export type RelativeFilePath = Branded<string, "RelativeFilePath">;

export const RelativeFilePath = {
  joinPath: (base: RelativeFilePath, ...paths: string[]): RelativeFilePath => {
    return path.join(base, ...paths) as RelativeFilePath;
  },
} as const;

/**
 * An absolute file path for the host filesystem.
 * An `AbsoluteFilePath` value does not guarantee the the path exists.
 */
export type AbsoluteFilePath = Branded<string, "AbsoluteFilePath">;
export const AbsoluteFilePath = {
  joinPath: (base: AbsoluteFilePath, ...paths: string[]): AbsoluteFilePath => {
    return path.join(base, ...paths) as AbsoluteFilePath;
  },
} as const;
