# Test fakes (server)

This document describes how we use **test doubles**, especially **fakes**, when testing the `@mono/server` app.

## Vocabulary

Following [Gerard Meszaros’s vocabulary](https://martinfowler.com/bliki/TestDouble.html) (via Martin Fowler’s summary), a **test double** is any substitute for a real dependency in a test. Common kinds:

| Kind | Role |
|------|------|
| **Dummy** | Fills a parameter; never used. |
| **Stub** | Returns canned answers; little or no logic. |
| **Spy** | A stub that records how it was used. |
| **Mock** | Primarily asserts **which calls** happened and **how** (interaction verification). Often tied to a mocking library. |
| **Fake** | A **working** implementation with real behaviour, but **simplified** for tests (e.g. in-memory storage instead of PostgreSQL). Usually not suitable for production. |

In **TypeScript**, a fake is often a `class` that **implements** the same interface as the production service (`implements ProjectsService`, etc.), so the system under test cannot tell the difference at the type level.

## Why prefer fakes over mocks for our services?

- **State and behaviour**: Tests assert **outcomes** (data returned, events recorded, in-memory state) instead of “`mockFn` was called once with these arguments.” That tracks product behaviour more closely.
- **Refactor safety**: Renaming or reordering internal calls is less likely to break tests that only cared about interactions.
- **Documentation**: A fake shows “what this dependency does” in one place (`src/test-fakes/`), instead of scattering `vi.fn()` setups across files.

Mocks and stubbed frameworks are still useful; see below.

## When to use fakes in this repo

Use **centralised fakes** from `apps/server/src/test-fakes/` when tests need our **application services** (memberships, workspaces, projects, task queue, runs, live events publishing, forge secrets, logger, DB transaction boundary, BullMQ `runQueue.add`, etc.).

- Extend or add fakes when multiple tests need the same behaviour.
- Keep fakes **small but honest**: implement the interface, use in-memory data, avoid simulating production bugs.

## When **not** to replace with fakes

**Mocks and lightweight stubs remain appropriate** when:

- Wrapping **Node.js, browser, or framework surfaces** we do not own (e.g. **`vi.mock` for `hono/streaming`**, auth/session modules tied to Better Auth, or timers).
- The dependency is a **thin adapter** and the test goal is strictly protocol or wiring.
- A full fake would be large and unused elsewhere; a **focused stub** is enough.

The rule of thumb: **fake our domain and services; mock the platform**.

## Practical notes (JavaScript / TypeScript)

- Fakes should **implement public interfaces** (`implements X`) so the compiler enforces method coverage.
- **Branded IDs** (`UserId`, `ProjectId`, …) still need casts at the edge of tests (`"user-1" as UserId`); the fake itself should use the real types.
- Fakes that contain non-trivial logic may deserve **their own unit tests** (Meszaros/Fowler note that fakes are real code).
- Prefer **recording** outputs (e.g. `CapturingLogger.infos`, `RecordingLiveEventsService.publishes`) over `expect(fn).toHaveBeenCalledWith(...)` when the production code only requires a **result**, not a specific call shape.

## Further reading

- [Test Double (Martin Fowler)](https://martinfowler.com/bliki/TestDouble.html) — definitions of fake vs mock vs stub, with pointers to *xUnit Test Patterns*.
- [Mocks Aren’t Stubs (Martin Fowler)](https://martinfowler.com/articles/mocksArentStubs.html) — classic contrast between **classical** (state/exercise) and **mockist** (interaction) testing.
