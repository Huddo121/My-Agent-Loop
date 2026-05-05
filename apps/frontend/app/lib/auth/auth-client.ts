import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const authClientOptions: {
  plugins: [
    ReturnType<typeof magicLinkClient>,
    ReturnType<typeof oauthProviderClient>,
  ];
} = {
  plugins: [magicLinkClient(), oauthProviderClient()],
};

type AuthClient = ReturnType<typeof createAuthClient<typeof authClientOptions>>;

export const authClient: AuthClient = createAuthClient(authClientOptions);
