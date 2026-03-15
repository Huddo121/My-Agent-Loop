import { unauthenticated } from "@mono/api";
import type { AuthSessionData } from "./AuthSession";
import { auth } from "./auth";

export async function getAuthSession(
  request: Request,
): Promise<AuthSessionData | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  return session as AuthSessionData | null;
}

export async function requireAuthSession(
  request: Request,
): Promise<AuthSessionData | [401, ReturnType<typeof unauthenticated>[1]]> {
  const session = await getAuthSession(request);
  if (session === null) {
    return unauthenticated();
  }
  return session;
}
