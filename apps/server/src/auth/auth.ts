import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { db } from "../db";
import {
  accountTable,
  sessionTable,
  userTable,
  verificationTable,
} from "../db/schema";
import { env } from "../env";

const authBaseURL = new URL("/api/auth", env.APP_BASE_URL).toString();

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
  ],
});
