import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt, magicLink } from "better-auth/plugins";
import { db } from "../db";
import {
  accountTable,
  sessionTable,
  userTable,
  verificationTable,
} from "../db/schema";
import { env } from "../env";

const authBaseURL = new URL("/api/auth", env.APP_BASE_URL).toString();

// The OAuth issuer identifier. This is the base URL the access tokens'
// `iss` claim will reference and the URL bearer-token verifiers consult.
const issuer = authBaseURL;

// The frontend sign-in surface today is the `AuthGate` component rendered at
// the root path when the user has no session, so the OAuth login prompt
// redirects there. A future TODO may introduce a dedicated `/sign-in` route;
// once it does this should be updated to match.
const loginPage = new URL("/", env.APP_BASE_URL).toString();

// Placeholder for the dedicated frontend OAuth consent route. The
// `frontend-oauth-consent-route` TODO will create the actual React Router
// route at this path. Keep these in sync.
const consentPage = new URL("/oauth/consent", env.APP_BASE_URL).toString();

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: authBaseURL,
  trustedOrigins: [env.APP_BASE_URL],
  emailAndPassword: {
    enabled: false,
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userTable,
      session: sessionTable,
      account: accountTable,
      verification: verificationTable,
    },
  }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        console.info("Magic link requested", { email, url });
      },
    }),
    // The jwt plugin must be registered for the oauth-provider plugin so
    // access/id tokens are signed asymmetrically and a JWKS endpoint is
    // exposed. We disable middleware-set JWT headers per the Better Auth
    // docs because session payloads should not be signed when running as an
    // OAuth provider.
    jwt({
      jwt: {
        issuer,
        audience: issuer,
      },
      disableSettingJwtHeader: true,
    }),
    oauthProvider({
      scopes: ["openid", "profile", "email", "offline_access"],
      // Tokens issued for the `mal-cli` client are audienced at the issuer
      // itself. Additional audiences (e.g. resource servers) can be added
      // here as the surface grows.
      validAudiences: [issuer],
      // `mal-cli` is a first-party CLI bundled with this product; cache it as
      // a trusted client so it bypasses the consent prompt and the row is
      // immutable through the CRUD endpoints.
      cachedTrustedClients: new Set(["mal-cli"]),
      loginPage,
      consentPage,
    }),
  ],
});
