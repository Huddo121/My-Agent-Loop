export function handleUnauthenticated(): never {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
  throw new Error("Unauthenticated");
}
