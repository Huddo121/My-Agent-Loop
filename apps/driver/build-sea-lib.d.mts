export function isSeaInjectionRequired(
  env?: Record<string, string | undefined>,
): boolean;

export function handleSeaInjectionFailure(options: {
  bundleFile: string;
  seaBlobFile: string;
  seaExeFile: string;
  error: unknown;
  injectionRequired: boolean;
}): void;
