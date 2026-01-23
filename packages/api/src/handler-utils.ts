import type {
  BadUserInput,
  NotFound,
  RateLimited,
  Unauthenticated,
  UnexpectedError,
} from "./common-schemas";

export function ok(): [200, undefined];
export function ok<A>(body: A): [200, A];
export function ok<A>(body?: A): [200, A | undefined] {
  return [200, body as A | undefined];
}

export const accepted = (): [204, undefined] => [204, undefined];

export const badUserInput = (message: string): [400, BadUserInput] => [
  400,
  { code: "bad-user-input", result: "error", message },
];
export const unauthenticated = (message?: string): [401, Unauthenticated] => [
  401,
  { code: "unauthenticated", result: "error", message },
];
export const notFound = (message?: string): [404, NotFound] => [
  404,
  { code: "not-found", result: "error", message },
];
export const rateLimited = (fields?: {
  message?: string;
  retryAfter?: number;
}): [429, RateLimited] => [
  429,
  {
    result: "rate-limited",
    ...fields,
  },
];

export const unexpectedError = (message?: string): [500, UnexpectedError] => [
  500,
  { code: "unexpected-error", result: "error", message },
];
