import type { ProjectId } from "@mono/api";
import type { ForgeSecretRepository } from "../forge-secrets";
import { ProtectedString } from "../utils/ProtectedString";

/**
 * In-memory forge tokens (plaintext kept for tests only).
 */
export class FakeForgeSecretRepository implements ForgeSecretRepository {
  private readonly secrets = new Map<ProjectId, string>();

  /** Synchronous test helper (avoids `await` in synchronous harness builders). */
  setPlainSecret(projectId: ProjectId, token: string): void {
    this.secrets.set(projectId, token);
  }

  async getForgeSecret(
    projectId: ProjectId,
  ): Promise<ProtectedString | undefined> {
    const plain = this.secrets.get(projectId);
    return plain === undefined ? undefined : new ProtectedString(plain);
  }

  async upsertForgeSecret(
    projectId: ProjectId,
    plainToken: string,
  ): Promise<void> {
    this.secrets.set(projectId, plainToken);
  }

  async deleteForgeSecret(projectId: ProjectId): Promise<void> {
    this.secrets.delete(projectId);
  }

  async hasForgeSecret(projectId: ProjectId): Promise<boolean> {
    return this.secrets.has(projectId);
  }
}
