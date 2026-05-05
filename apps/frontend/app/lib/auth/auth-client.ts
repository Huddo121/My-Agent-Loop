import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

type AuthSession = {
  data: unknown | null;
  isPending: boolean;
  isRefetching: boolean;
  error: unknown | null;
  refetch: () => Promise<void>;
};

type AppAuthClient = {
  useSession: () => AuthSession;
  signIn: {
    magicLink: (input: {
      email: string;
      callbackURL: string;
    }) => Promise<unknown>;
  };
};

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), oauthProviderClient()],
}) as unknown as AppAuthClient;
