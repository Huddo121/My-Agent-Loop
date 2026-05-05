import { describe, expect, it } from "vitest";

import { SaltedEncryptionService } from "./SaltedEncryptionService";

const TEST_MASTER_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("SaltedEncryptionService", () => {
  it("round-trips plaintext", () => {
    const svc = new SaltedEncryptionService(TEST_MASTER_HEX);
    const plain = "oauth refresh token \u{1F600}";
    const rec = svc.encrypt(plain);
    expect(svc.decrypt(rec)).toBe(plain);
  });

  it("uses a unique keySalt per encrypt", () => {
    const svc = new SaltedEncryptionService(TEST_MASTER_HEX);
    const a = svc.encrypt("same");
    const b = svc.encrypt("same");
    expect(a.keySalt).not.toBe(b.keySalt);
    expect(a.payload).not.toBe(b.payload);
    const salts = new Set([a.keySalt, b.keySalt]);
    expect(salts.size).toBe(2);
  });

  it("detects tampering of the auth tag / ciphertext", () => {
    const svc = new SaltedEncryptionService(TEST_MASTER_HEX);
    const rec = svc.encrypt("secret");
    const parts = rec.payload.split(":");
    expect(parts).toHaveLength(3);
    const [iv, ct, tag] = parts;
    const corruptB64 = (b64: string) => {
      const buf = Buffer.from(b64, "base64");
      buf[0] ^= 0xff;
      return buf.toString("base64");
    };
    expect(() =>
      svc.decrypt({
        keySalt: rec.keySalt,
        payload: [iv, ct, corruptB64(tag)].join(":"),
      }),
    ).toThrow();
    expect(() =>
      svc.decrypt({
        keySalt: rec.keySalt,
        payload: [iv, corruptB64(ct), tag].join(":"),
      }),
    ).toThrow();
  });

  it("rejects wrong keySalt length after decode", () => {
    const svc = new SaltedEncryptionService(TEST_MASTER_HEX);
    const rec = svc.encrypt("x");
    expect(() =>
      svc.decrypt({
        keySalt: Buffer.alloc(8).toString("base64"),
        payload: rec.payload,
      }),
    ).toThrow(/keySalt/);
  });
});
