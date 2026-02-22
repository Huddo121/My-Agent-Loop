import type { ProjectId } from "@mono/api";
import { eq } from "drizzle-orm";
import { projectForgeSecretsTable } from "../db/schema";
import type { EncryptionService } from "../utils/EncryptionService";
import { ProtectedString } from "../utils/ProtectedString";
import { getTransaction } from "../utils/transaction-context";

export interface ForgeSecretRepository {
  getForgeSecret(projectId: ProjectId): Promise<ProtectedString | undefined>;
  upsertForgeSecret(projectId: ProjectId, plainToken: string): Promise<void>;
  deleteForgeSecret(projectId: ProjectId): Promise<void>;
  hasForgeSecret(projectId: ProjectId): Promise<boolean>;
}

export class DefaultForgeSecretRepository implements ForgeSecretRepository {
  constructor(private readonly encryptionService: EncryptionService) {}

  async getForgeSecret(
    projectId: ProjectId,
  ): Promise<ProtectedString | undefined> {
    const tx = getTransaction();
    const [row] = await tx
      .select({ encryptedToken: projectForgeSecretsTable.encryptedToken })
      .from(projectForgeSecretsTable)
      .where(eq(projectForgeSecretsTable.projectId, projectId))
      .limit(1);

    if (!row) {
      return undefined;
    }
    const plain = this.encryptionService.decrypt(row.encryptedToken);
    return new ProtectedString(plain);
  }

  async upsertForgeSecret(
    projectId: ProjectId,
    plainToken: string,
  ): Promise<void> {
    const tx = getTransaction();
    const encrypted = this.encryptionService.encrypt(plainToken);
    await tx
      .insert(projectForgeSecretsTable)
      .values({
        projectId,
        encryptedToken: encrypted,
      })
      .onConflictDoUpdate({
        target: projectForgeSecretsTable.projectId,
        set: { encryptedToken: encrypted },
      });
  }

  async deleteForgeSecret(projectId: ProjectId): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(projectForgeSecretsTable)
      .where(eq(projectForgeSecretsTable.projectId, projectId));
  }

  async hasForgeSecret(projectId: ProjectId): Promise<boolean> {
    const tx = getTransaction();
    const [row] = await tx
      .select({ projectId: projectForgeSecretsTable.projectId })
      .from(projectForgeSecretsTable)
      .where(eq(projectForgeSecretsTable.projectId, projectId))
      .limit(1);
    return row !== undefined;
  }
}
