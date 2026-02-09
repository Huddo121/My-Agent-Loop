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

// /**
//  * Returns a response tuple for HTTP 202 Accepted status code.
//  * @param body - Optional response body (defaults to undefined)
//  * @returns A tuple [202, body] suitable for use in endpoint handlers
//  */
export const accepted = <T = undefined>(body?: T): [202, T] => {
  return [202, body as T];
};

/**
 * Returns a response tuple for HTTP 204 No Content status code.
 * @returns A tuple [204, undefined] suitable for use in endpoint handlers
 */
export const noContent = (): [204, undefined] => {
  return [204, undefined];
};

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
