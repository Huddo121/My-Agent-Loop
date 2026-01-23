import z from "zod";

export const badUserInputSchema = z.object({
  result: z.literal("error"),
  code: z.literal("bad-user-input"),
  message: z.string(),
});

export type BadUserInput = z.infer<typeof badUserInputSchema>;

export const unauthenticatedSchema = z.object({
  result: z.literal("error"),
  code: z.literal("unauthenticated"),
  message: z.string().optional(),
});

export type Unauthenticated = z.infer<typeof unauthenticatedSchema>;

export const notFoundSchema = z.object({
  result: z.literal("error"),
  code: z.literal("not-found"),
  message: z.string().optional(),
});

export type NotFound = z.infer<typeof notFoundSchema>;

export const rateLimitedSchema = z.object({
  result: z.literal("rate-limited"),
  retryAfter: z.number().optional(),
  message: z.string().optional(),
});

export type RateLimited = z.infer<typeof rateLimitedSchema>;

export const unexpectedErrorSchema = z.object({
  result: z.literal("error"),
  code: z.literal("unexpected-error"),
  message: z.string().optional(),
});

export type UnexpectedError = z.infer<typeof unexpectedErrorSchema>;
