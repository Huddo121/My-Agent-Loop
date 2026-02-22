import * as crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH_BYTES = 32;

/**
 * Parses a master key from env (32-byte hex or base64).
 * Returns a Buffer of exactly 32 bytes.
 */
function parseMasterKey(raw: string): Buffer {
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, "hex");
  } else {
    buf = Buffer.from(raw, "base64");
  }
  if (buf.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `FORGE_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}). Use 64 hex chars or 44 base64 chars.`,
    );
  }
  return buf;
}

export interface EncryptionService {
  encrypt(plaintext: string): string;
  decrypt(encrypted: string): string;
}

export class DefaultEncryptionService implements EncryptionService {
  private readonly key: Buffer;

  constructor(masterKeyRaw: string) {
    this.key = parseMasterKey(masterKeyRaw);
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString("base64"),
      encrypted.toString("base64"),
      authTag.toString("base64"),
    ].join(":");
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split(":");
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
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}
