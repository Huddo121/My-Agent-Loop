import type { Logger } from "../logger/Logger";

/**
 * Demultiplexes a Docker container log stream.
 * Docker multiplexed streams have an 8-byte header per frame:
 * - Byte 0: stream type (0=stdin, 1=stdout, 2=stderr)
 * - Bytes 1-3: padding (zeros)
 * - Bytes 4-7: frame size as big-endian uint32
 *
 * This function strips the headers and returns the concatenated content.
 */
const demuxDockerStream = (buffer: Buffer): string => {
  const chunks: string[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    // Need at least 8 bytes for the header
    if (offset + 8 > buffer.length) {
      // Incomplete header, append remaining bytes as-is (shouldn't happen normally)
      chunks.push(buffer.subarray(offset).toString());
      break;
    }

    // Read frame size from bytes 4-7 (big-endian uint32)
    const frameSize = buffer.readUInt32BE(offset + 4);

    // Extract the frame content (after the 8-byte header)
    const frameStart = offset + 8;
    const frameEnd = frameStart + frameSize;

    if (frameEnd > buffer.length) {
      // Frame extends beyond buffer, take what we have
      chunks.push(buffer.subarray(frameStart).toString());
      break;
    }

    chunks.push(buffer.subarray(frameStart, frameEnd).toString());
    offset = frameEnd;
  }

  return chunks.join("");
};

export class DockerLoggingService {
  constructor(private readonly logger: Logger) {}

  attach(
    stream: NodeJS.ReadableStream,
    metadata: { containerName: string; containerId: string },
  ): void {
    stream.on("data", (chunk: Buffer) => {
      const content = demuxDockerStream(chunk);
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.trim()) {
          this.logger.info(`[${metadata.containerName}] ${line}`);
        }
      }
    });

    stream.on("error", (err: Error) => {
      this.logger.error(
        `[${metadata.containerName}] Log stream error: ${err.message}`,
      );
    });
  }
}
