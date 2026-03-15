import type { AuthSessionData } from "./AuthSession";
import { auth } from "./auth";
import type { UserId } from "./UserId";

export async function getAuthSession(
  request: Request,
): Promise<AuthSessionData | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  if (session === null) {
    return null;
  }

  return {
    session: {
      ...session.session,
      userId: session.session.userId as UserId,
    },
    user: {
      ...session.user,
      id: session.user.id as UserId,
    },
  };
}

export async function requireAuthSession(
  request: Request,
): Promise<AuthSessionData | null> {
  return getAuthSession(request);
}
