import { and, eq } from "drizzle-orm";
import type { UserId } from "../auth/UserId";
import { userHarnessOAuthCredentialsTable } from "../db/schema";
import { ProtectedString } from "../utils/ProtectedString";
import type { SaltedEncryptionService } from "../utils/SaltedEncryptionService";
import { getTransaction } from "../utils/transaction-context";

export interface UserOAuthCredential {
  providerId: string;
  tokens: ProtectedString;
  lastRefresh: Date;
}

export interface UserOAuthCredentialSummary {
  providerId: string;
  lastRefresh: Date;
}

export interface UserOAuthCredentialRepository {
  getCredential(
    userId: UserId,
    providerId: string,
  ): Promise<UserOAuthCredential | undefined>;
  hasCredential(userId: UserId, providerId: string): Promise<boolean>;
  upsertCredential(
    userId: UserId,
    providerId: string,
    plainTokens: string,
    lastRefresh: Date,
  ): Promise<void>;
  deleteCredential(userId: UserId, providerId: string): Promise<void>;
  listCredentials(userId: UserId): Promise<UserOAuthCredentialSummary[]>;
}

export class DefaultUserOAuthCredentialRepository
  implements UserOAuthCredentialRepository
{
  constructor(
    private readonly saltedEncryptionService: SaltedEncryptionService,
  ) {}

  async getCredential(
    userId: UserId,
    providerId: string,
  ): Promise<UserOAuthCredential | undefined> {
    const tx = getTransaction();
    const [row] = await tx
      .select({
        providerId: userHarnessOAuthCredentialsTable.providerId,
        keySalt: userHarnessOAuthCredentialsTable.keySalt,
        encryptedTokens: userHarnessOAuthCredentialsTable.encryptedTokens,
        lastRefresh: userHarnessOAuthCredentialsTable.lastRefresh,
      })
      .from(userHarnessOAuthCredentialsTable)
      .where(
        and(
          eq(userHarnessOAuthCredentialsTable.userId, userId),
          eq(userHarnessOAuthCredentialsTable.providerId, providerId),
        ),
      )
      .limit(1);

    if (!row) {
      return undefined;
    }

    const plainTokens = this.saltedEncryptionService.decrypt({
      keySalt: row.keySalt,
      payload: row.encryptedTokens,
    });

    return {
      providerId: row.providerId,
      tokens: new ProtectedString(plainTokens),
      lastRefresh: row.lastRefresh,
    };
  }

  async hasCredential(userId: UserId, providerId: string): Promise<boolean> {
    const tx = getTransaction();
    const [row] = await tx
      .select({ providerId: userHarnessOAuthCredentialsTable.providerId })
      .from(userHarnessOAuthCredentialsTable)
      .where(
        and(
          eq(userHarnessOAuthCredentialsTable.userId, userId),
          eq(userHarnessOAuthCredentialsTable.providerId, providerId),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  async upsertCredential(
    userId: UserId,
    providerId: string,
    plainTokens: string,
    lastRefresh: Date,
  ): Promise<void> {
    const tx = getTransaction();
    const now = new Date();
    const encrypted = this.saltedEncryptionService.encrypt(plainTokens);

    await tx
      .insert(userHarnessOAuthCredentialsTable)
      .values({
        userId,
        providerId,
        keySalt: encrypted.keySalt,
        encryptedTokens: encrypted.payload,
        lastRefresh,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userHarnessOAuthCredentialsTable.userId,
          userHarnessOAuthCredentialsTable.providerId,
        ],
        set: {
          keySalt: encrypted.keySalt,
          encryptedTokens: encrypted.payload,
          lastRefresh,
          updatedAt: now,
        },
      });
  }

  async deleteCredential(userId: UserId, providerId: string): Promise<void> {
    const tx = getTransaction();
    await tx
      .delete(userHarnessOAuthCredentialsTable)
      .where(
        and(
          eq(userHarnessOAuthCredentialsTable.userId, userId),
          eq(userHarnessOAuthCredentialsTable.providerId, providerId),
        ),
      );
  }

  async listCredentials(userId: UserId): Promise<UserOAuthCredentialSummary[]> {
    const tx = getTransaction();
    return await tx
      .select({
        providerId: userHarnessOAuthCredentialsTable.providerId,
        lastRefresh: userHarnessOAuthCredentialsTable.lastRefresh,
      })
      .from(userHarnessOAuthCredentialsTable)
      .where(eq(userHarnessOAuthCredentialsTable.userId, userId));
  }
}
