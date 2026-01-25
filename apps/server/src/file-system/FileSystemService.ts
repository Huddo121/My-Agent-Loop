import fs from "node:fs";
import path, { isAbsolute } from "node:path";
import type { RunId } from "../runs/RunId";
import type { AbsoluteFilePath, RelativeFilePath } from "./FilePath";

export interface FileSystemService {
  /**
   * @param runId The {@link RunId} for the current run. Each run will result in its own unique temporary folder.
   */
  createTemporaryDirectory(runId: RunId): Promise<AbsoluteFilePath>;
}

export class LocalFileSystemService implements FileSystemService {
  private readonly basePath: AbsoluteFilePath;
  constructor(basePath: RelativeFilePath | AbsoluteFilePath) {
    if (isAbsolute(basePath)) {
      this.basePath = basePath as AbsoluteFilePath;
    } else {
      this.basePath = path.resolve(process.cwd(), basePath) as AbsoluteFilePath;
    }
  }

  async createTemporaryDirectory(runId: RunId): Promise<AbsoluteFilePath> {
    const folderPath = path.resolve(this.basePath, runId.toString());

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    return folderPath as AbsoluteFilePath;
  }
}
