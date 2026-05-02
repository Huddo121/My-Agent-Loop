# Decision: Central test fakes for `@mono/server`

## Context

Handler and workflow tests were using ad hoc `vi.fn()` objects for application services. That spreads interaction-style mocking, duplicates setup, and couples tests to call order.

## Decision

1. **Maintain `apps/server/src/test-fakes/`** — typed, in-memory implementations (and small recorders) for server interfaces used across tests.
2. **Prefer fakes for our services**; **keep `vi.mock` / stubs for platform/framework** boundaries (e.g. Hono streaming, session/auth wiring) where a full fake buys little.
3. **`vitest.setup.ts`** sets minimal `process.env` defaults so modules that load `src/env.ts` can be imported in tests without a local `.env` file.

## Consequences

- New or changing service interfaces should update the corresponding fake(s) in the same change when tests break.
- Tests shift toward asserting **state and results** (recorded events, maps, counters) rather than only **mock invocation counts**.
