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

export function handleUnauthenticated(): never {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
  throw new Error("Unauthenticated");
}
