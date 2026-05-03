import { Endpoint } from "cerato";
import z from "zod";
import { isoDatetimeToDate } from "../common-codecs";
import { badUserInputSchema, unauthenticatedSchema } from "../common-schemas";

export const harnessCredentialProviderIdSchema = z.literal("openai-codex");
export type HarnessCredentialProviderId = z.infer<
  typeof harnessCredentialProviderIdSchema
>;

export const harnessCredentialSummaryDtoSchema = z.object({
  providerId: harnessCredentialProviderIdSchema,
  lastRefresh: isoDatetimeToDate,
});
export type HarnessCredentialSummaryDto = z.infer<
  typeof harnessCredentialSummaryDtoSchema
>;

export const harnessCredentialTokensRequestSchema = z.object({
  tokens: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    id_token: z.string().min(1),
  }),
});
export type HarnessCredentialTokensRequest = z.infer<
  typeof harnessCredentialTokensRequestSchema
>;

export const meApi = Endpoint.multi({
  children: {
    "harness-credentials": Endpoint.multi({
      GET: Endpoint.get()
        .output(200, z.array(harnessCredentialSummaryDtoSchema))
        .output(401, unauthenticatedSchema),
      children: {
        ":providerId": Endpoint.multi({
          PUT: Endpoint.put()
            .input(harnessCredentialTokensRequestSchema)
            .output(200, harnessCredentialSummaryDtoSchema)
            .output(400, badUserInputSchema)
            .output(401, unauthenticatedSchema),
          DELETE: Endpoint.delete()
            .output(204, z.undefined())
            .output(400, badUserInputSchema)
            .output(401, unauthenticatedSchema),
        }),
      },
    }),
  },
});
