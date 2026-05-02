/**
 * Minimal env for unit tests so modules that load `src/env.ts` (via auth/db, etc.)
 * can be imported without a local `.env`.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.REDIS_HOST ??= "127.0.0.1";
process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret-min-32-chars!";
process.env.FORGE_ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.NODE_ENV ??= "test";
