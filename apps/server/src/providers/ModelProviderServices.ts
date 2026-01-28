import type { Branded } from "../utils/Branded";
import { ProtectedString } from "../utils/ProtectedString";

/** The ID (really name) of the supported model provider */
export type ModelProviderId = "openrouter";

/**
 * The API key of a provider.
 * Should not be logged. I should actually wrap it in something that prevents accidental disclosure
 */
export type ProviderApiKey = ProtectedString<Branded<string, "ProviderApiKey">>;

export type ProviderAuthConfig = {
  [key in ModelProviderId]: ProviderApiKey;
};

/** Only intended to make it easy for this service to be instantiated when pulling environment variables */
type RawProviderAuthConfig = {
  [key in ModelProviderId]: string | undefined;
};

export class ModelProviderService {
  readonly authConfig: ProviderAuthConfig;

  constructor(authConfig: RawProviderAuthConfig) {
    this.authConfig = Object.entries(authConfig).reduce((acc, [key, value]) => {
      if (value === undefined) return acc;
      return Object.assign(acc, { [key]: new ProtectedString(value) });
    }, {} as ProviderAuthConfig);
  }

  getAvailableProviders(): ModelProviderId[] {
    return Object.keys(this.authConfig) as ModelProviderId[];
  }
}
