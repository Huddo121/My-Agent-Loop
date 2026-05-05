import {
  badUserInput,
  type HarnessCredentialProviderId,
  type MyAgentLoopApi,
  noContent,
  ok,
  unauthenticated,
} from "@mono/api";
import type { HonoHandlersFor } from "cerato";
import { requireOAuthBearer } from "../auth/oauth-bearer";
import {
  openAiCodexTokenBundleSchema,
  parseChatGptJwt,
} from "../oauth-providers";
import type { Services } from "../services";
import type { UserOAuthCredentialSummary } from "../user-oauth-credentials";
import { withNewTransaction } from "../utils/transaction-context";

type MeApi = MyAgentLoopApi["me"];

function isProviderId(
  providerId: string,
): providerId is HarnessCredentialProviderId {
  if (providerId === "openai-codex") {
    return true;
  }
  return false;
}

function parseProviderId(
  providerId: string,
): HarnessCredentialProviderId | null {
  return isProviderId(providerId) ? providerId : null;
}

function isSupportedSummary(
  credential: UserOAuthCredentialSummary,
): credential is UserOAuthCredentialSummary & {
  providerId: HarnessCredentialProviderId;
} {
  return isProviderId(credential.providerId);
}

export const meHandlers: HonoHandlersFor<["me"], MeApi, Services> = {
  "harness-credentials": {
    GET: async (ctx) => {
      const userId = await requireOAuthBearer(ctx.hono.req.raw);
      if (userId === null) {
        return unauthenticated();
      }

      return withNewTransaction(ctx.services.db, async () => {
        const credentials =
          await ctx.services.userOAuthCredentialRepository.listCredentials(
            userId,
          );
        return ok(credentials.filter(isSupportedSummary));
      });
    },
    ":providerId": {
      PUT: async (ctx) => {
        const userId = await requireOAuthBearer(ctx.hono.req.raw);
        if (userId === null) {
          return unauthenticated();
        }

        const providerId = parseProviderId(ctx.hono.req.param().providerId);
        if (providerId === null) {
          return badUserInput("Unsupported harness credential provider.");
        }

        const accountId = await parseChatGptJwt(ctx.body.tokens.access_token);
        if (!accountId.success) {
          return badUserInput("Access token is not a valid ChatGPT JWT.");
        }

        const tokenBundle = openAiCodexTokenBundleSchema.safeParse({
          ...ctx.body.tokens,
          account_id: accountId.value,
        });
        if (!tokenBundle.success) {
          return badUserInput("Harness credential tokens are invalid.");
        }

        return withNewTransaction(ctx.services.db, async () => {
          const lastRefresh = new Date();
          await ctx.services.userOAuthCredentialRepository.upsertCredential(
            userId,
            providerId,
            JSON.stringify(tokenBundle.data),
            lastRefresh,
          );
          return ok({ providerId, lastRefresh });
        });
      },
      DELETE: async (ctx) => {
        const userId = await requireOAuthBearer(ctx.hono.req.raw);
        if (userId === null) {
          return unauthenticated();
        }

        const providerId = parseProviderId(ctx.hono.req.param().providerId);
        if (providerId === null) {
          return badUserInput("Unsupported harness credential provider.");
        }

        return withNewTransaction(ctx.services.db, async () => {
          await ctx.services.userOAuthCredentialRepository.deleteCredential(
            userId,
            providerId,
          );
          return noContent();
        });
      },
    },
  },
};
