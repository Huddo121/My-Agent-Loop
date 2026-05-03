import { createHash, randomBytes } from "node:crypto";

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export type PkceChallenge = {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
};

export function createPkceChallenge(): PkceChallenge {
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(
    createHash("sha256").update(codeVerifier).digest(),
  );
  const state = base64Url(randomBytes(32));

  return { codeVerifier, codeChallenge, state };
}
