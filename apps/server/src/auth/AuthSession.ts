import type { UserId } from "./UserId";

export interface AuthSessionUser {
  id: UserId;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSessionData {
  session: {
    id: string;
    token: string;
    userId: UserId;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: AuthSessionUser;
}
