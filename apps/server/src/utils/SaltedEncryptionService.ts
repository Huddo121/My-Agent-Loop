import * as crypto from "node:crypto";

import { parse32ByteMasterKey } from "./EncryptionService";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AES_KEY_LENGTH = 32;
/** Random bytes per encrypt(); stored as standard base64 in `keySalt`. */
const KEY_SALT_LENGTH = 16;
const HKDF_INFO = Buffer.from("mal:oauth-credentials:v1", "utf8");

export interface SaltedEncryptedRecord {
  /** 16 random bytes, standard base64 (not hex). */
  keySalt: string;
  /** iv:ciphertext:authTag (each segment standard base64), same as forge EncryptionService. */
  payload: string;
}

/**
 * AES-256-GCM with a per-record key derived via HKDF-SHA256(masterKey, keySalt, fixed info).
 * Payload ciphertext format matches {@link DefaultEncryptionService}.
 */
export class SaltedEncryptionService {
  private readonly masterKey: Buffer;

  constructor(masterKeyRaw: string) {
    this.masterKey = parse32ByteMasterKey(
      masterKeyRaw,
      "OAUTH_CREDENTIALS_ENCRYPTION_KEY",
    );
  }

  private deriveAesKey(keySalt: Buffer): Buffer {
    return Buffer.from(
      crypto.hkdfSync(
        "sha256",
        this.masterKey,
        keySalt,
        HKDF_INFO,
        AES_KEY_LENGTH,
      ),
    );
  }

  encrypt(plaintext: string): SaltedEncryptedRecord {
    const keySaltBuf = crypto.randomBytes(KEY_SALT_LENGTH);
    const key = this.deriveAesKey(keySaltBuf);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
      keySalt: keySaltBuf.toString("base64"),
      payload: [
        iv.toString("base64"),
        encrypted.toString("base64"),
        authTag.toString("base64"),
      ].join(":"),
    };
  }

  decrypt(record: SaltedEncryptedRecord): string {
    const keySaltBuf = Buffer.from(record.keySalt, "base64");
    if (keySaltBuf.length !== KEY_SALT_LENGTH) {
      throw new Error(
        `Invalid keySalt: expected ${KEY_SALT_LENGTH} bytes after base64 decode`,
      );
    }
    const key = this.deriveAesKey(keySaltBuf);
    const parts = record.payload.split(":");
    if (parts.length !== 3) {
      throw new Error(
        "Invalid encrypted payload: expected iv:ciphertext:authTag",
      );
    }
    const [ivB64, ciphertextB64, authTagB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error("Invalid encrypted payload: bad iv or authTag length");
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}
