# Coding Practices

Because this codebase will be worked on by many autonomous agents, sometimes in parallel, it's important for there to be clear separation of concern between different parts of the codebase, and well-defined APIs between different parts of the system. We should leverage tools like the typechecker and tests to ensure that the code we're writing will work with the rest of the system.


## Principles of this codebase

1. **API-First**: All interactions accessible via well-defined APIs, clearly delineated internal and external details
2. **Typesafe**: As much as is practical we want a typesafe codebase.
  a. Minimal casting, use techniques like branded types, discriminated unions, and prefer disjunctions of strings over booleans for readability
  b. Maintaining a clear separation between types at the data layer, service layer, and api layers to allow each of them to evolve independently
  c. Prefer returning values indicating an error over throwing `Error`s
  d. Use tools like Zod and ts-pattern to do runtime checks at the edges of each system
3. **Evolvable and anti-brittle**: Many of the tools and techniques used here aim to make code safer to modify
  a. Pattern matching with exhaustiveness checking (`ts-pattern`) ensures that when we change code in one place, we know all the places that might need to be changed to handle it
  b. The aversion to throwing `Error`s for known business-logic failures is for the same reason
  c. Prefer to use explicit, exported type aliases over inlined type definitions

## Code style

### Naming

Don't needlessly shorten names for variables. Using plain english names is preferred.

Bad: `taskCfg`
Good: `taskConfig`

Exception: Functions that work over generic arguments. If we implemented a function `map`, it's acceptable for it to be defined like `<A,B>map(f: (a:A) => B): B`

## Where to place code

This repository follows a domain-oriented approach to its folder structures within each package or app. As an example, if there's some APIs related `User`s, then there will likely be a `users` folder with all of a web handler/controller, the Web API shapes for `User`s, the core model for `User`, a `UserService`, and possibly a `UserRepo` for the database operations.

There should also be test files next to each of the relevant files here, keeping the tests with the code that they're testing helps keep the codebase easily navigable, and makes refactorings that move code around much easier. For example, `Foo.test.ts` should live in the same folder as `Foo.ts`, not in a separate `__tests__` directory.

### Circular dependencies

These should be avoided. This applies to both imports from different folders, or even the packages and apps within this monorepo.

### Limit library sprawl

We want to limit the number of different libraries and tools that are used. If we use a library in one package or app, we shouldn't use an alternative in another just because. When selecting a library or tool, do a quick check to see if there are any alternatives that are already in use within the project.

### Runtime versions

Node.js code should target the current active LTS release, matching the repository's `.nvmrc`. Avoid targeting older Node versions merely because they are the minimum required by a feature.

### Moon task overrides

Top-level Moon tasks may fan out across every app and package. If a project needs to participate in a top-level task but should not run real work for that task, define a project-local `moon.yml` task override with `command: noop` and `local: true`. Prefer this over adding placeholder package scripts such as `"dev": "true"` to `package.json`.

For example, library packages and non-interactive apps that should not launch a development server can use:

```yaml
tasks:
  dev:
    command: noop
    local: true
```

### JavaScript build helpers

JavaScript build scripts and helpers should carry their own types with JSDoc and `// @ts-check`. Avoid adding sibling `.d.ts` or `.d.mts` files for local build helper modules.

### Internal implementations and 'privacy'

Typescript has limited facilities for marking code as "private". Classes can have private instance variables and methods, and a package can choose not to export a value, and that's about it. This is obviously very annoying if you want to break up your code, or export functions so that they can be tested, but in doing so you lose any real ability to prevent their use somewhere unexpected.

In this codebase, if a folder has a barrel file (an index.ts{x}), then you should assume that anything *not* exported from that file is expected to be private. In these cases only other bits of code inside that folder should import the values.

## Techniques

**NB:** Not all these techniques are set up in the repo yet

### Branded types

Branded types mimic the behaviour of nominal types, preventing two values that are really the same underlying type (commonly `string`) being used interchangeably. This is incredibly useful when you have many different APIs within a codebase that take some kind of `id: string`, but in reality only one kind of `string` will work.

### Pattern matching with exhaustiveness checking

Using the type system to our advantage, we can use `ts-pattern` to ensure that we're handling all the cases we need to. When we add a new case (e.g. failure result from a function) we can ensure that all the call-sites that previously called this function now need to be updated to explicitly handle the newly added failure case.

### Nullability at the edges

Handle null (or optional) values at the boundaries of your code, not in the middle. Prefer APIs that require non-null values so that callers are responsible for ensuring data exists before calling.

- **Hooks and services**: Accept required IDs (e.g. `WorkspaceId`) rather than `WorkspaceId | null`. Callers that have a possibly-null ID should only invoke the hook when the ID is defined (e.g. by only rendering the component that uses the hook when the ID is available), or should resolve the null at the call site before calling.
- **Components**: Prefer required props (e.g. `workspace: Workspace`) when the component is only ever used in a context where that value is always defined. The parent (the “edge”) then guarantees the value and the child does no null checks.
- Avoid scattering `if (x == null) return ...` or optional chaining inside shared hooks and presentational components when the null case can be handled once at the call site or by the type system.

### Runtime parsing

Using Zod, schemas can be created for things (e.g. a `userSchema`), which is a parser of objects. This allows us to ensure data coming from untrusted sources is the right shape and prevent bad data flowing through the system at runtime.

### Result

We use a `Result` type (basically `Either`) in order to properly capture the idea that a function might return a "failed" result that we want to handle.

### Vitest module mocks

When mocking dependencies with Vitest's `vi.mock`, pass a **dynamic `import()`** as the first argument instead of a string literal module specifier. TypeScript type-checks the path the same way as a normal import, and refactors (moving or renaming modules) are far less likely to leave a stale mock string behind.

```typescript
// Good — the specifier is checked like an import; tooling can follow renames
vi.mock(import("../../some-module"), () => ({ ... }));

// Avoid — unchecked strings; easy to drift from real imports
vi.mock("../other-module", () => ({ ... }));
```

Use this for relative paths, package imports (for example `hono/streaming`, `react-router`), path aliases (for example `~/lib/auth`), and built-in modules (for example `node:child_process`). For partial mocks, use an async factory with `importOriginal` so the real module shape stays in sync:

```typescript
vi.mock(import("~/lib/auth"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMagicLinkSignIn: () => ({ ... }),
  } as unknown as Awaited<typeof import("~/lib/auth")>;
});
```

Vitest types the mock factory as returning a `Partial` of the resolved module. When a stub deliberately uses narrower or looser shapes (for example `vi.fn()` stand-ins), assert the factory return as `unknown` then `Awaited<typeof import("...")>` so the **module specifier** stays fully type-checked while the stub body stays practical.

### DTO / transformation functions must be pure

Functions that map a domain model to a DTO (or vice versa) must be pure: they take data in and
return data out. They must not accept a `Services` object, make database calls, or call any other
async dependencies. If the transformation needs data that isn't already on the source object (e.g.
a config value stored in a separate table), the caller is responsible for fetching it first and
passing it in as a plain value.

This keeps transformations fast, trivially testable, and free of hidden side-effects.

### HTTP error responses must use the standard error helpers

All `400 Bad Request` responses must be returned using the `badUserInput()` helper from
`@mono/api`, which produces a body matching `badUserInputSchema`. Inline ad-hoc shapes such as
`{ error: string }` are not permitted as they break the client's ability to handle errors
uniformly.

Use the appropriate helper for each status code:

| Status | Helper | Schema |
|--------|--------|--------|
| 400 | `badUserInput(message)` | `badUserInputSchema` |
| 401 | `unauthenticated(message?)` | `unauthenticatedSchema` |
| 404 | `notFound(message?)` | `notFoundSchema` |
| 500 | `unexpectedError(message?)` | `unexpectedErrorSchema` |
