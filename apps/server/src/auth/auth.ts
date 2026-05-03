import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt, magicLink } from "better-auth/plugins";
import { db } from "../db";
import {
  accountTable,
  jwksTable,
  oauthAccessTokenTable,
  oauthClientTable,
  oauthConsentTable,
  oauthRefreshTokenTable,
  sessionTable,
  userTable,
  verificationTable,
} from "../db/schema";
import { env } from "../env";

const authBaseURL = new URL("/api/auth", env.APP_BASE_URL).toString();
const appOrigin = new URL(env.APP_BASE_URL).origin;
const loginPageURL = new URL("/", env.APP_BASE_URL).toString();
const consentPageURL = new URL("/oauth/consent", appOrigin).toString();

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: authBaseURL,
  trustedOrigins: [env.APP_BASE_URL],
  disabledPaths: ["/token"],
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
      jwks: jwksTable,
      oauthClient: oauthClientTable,
      oauthAccessToken: oauthAccessTokenTable,
      oauthRefreshToken: oauthRefreshTokenTable,
      oauthConsent: oauthConsentTable,
    },
  }),
  plugins: [
    jwt({
      disableSettingJwtHeader: true,
      jwt: {
        issuer: authBaseURL,
        audience: authBaseURL,
      },
    }),
    oauthProvider({
      scopes: ["openid", "profile", "email", "offline_access"],
      validAudiences: [authBaseURL],
      cachedTrustedClients: new Set(["mal-cli"]),
      loginPage: loginPageURL,
      consentPage: consentPageURL,
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        console.info("Magic link requested", { email, url });
      },
    }),
  ],
});
