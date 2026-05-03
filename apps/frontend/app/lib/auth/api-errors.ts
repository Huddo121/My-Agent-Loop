export function getRelativeCallbackUrl(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  const { pathname, search, hash } = window.location;
  if (!pathname.startsWith("/")) {
    return "/";
  }

  return `${pathname}${search}${hash}`;
}

/**
 * Validate a `redirectTo` value for same-origin path safety.
 *
 * Returns the raw value if it is a same-origin relative path, otherwise
 * `null`. We only accept strings that start with a single `/` and are not
 * protocol-relative (e.g. `//evil.example.com/x`) and are not anchor-only
 * fragments. Same-origin enforcement is deliberately conservative — anything
 * we cannot prove is safe is rejected.
 */
// TODO: Return a branded type for this
export function sanitizeSameOriginRedirect(
  redirectTo: string | null | undefined,
): string | null {
  if (typeof redirectTo !== "string" || redirectTo.length === 0) {
    return null;
  }
  if (!redirectTo.startsWith("/")) {
    return null;
  }
  // Reject protocol-relative URLs ("//evil.example.com/x").
  if (redirectTo.startsWith("//")) {
    return null;
  }
  // Reject backslash-trickery that some browsers normalize ("/\\evil.com").
  if (redirectTo.startsWith("/\\")) {
    return null;
  }
  return redirectTo;
}

export function handleUnauthenticated(): never {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
  throw new Error("Unauthenticated");
}
