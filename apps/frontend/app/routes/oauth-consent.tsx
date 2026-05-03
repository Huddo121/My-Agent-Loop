import { Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth";

export function meta() {
  return [
    { title: "Authorize access — My Agent Loop" },
    {
      name: "description",
      content: "Review and approve access for an OAuth client.",
    },
  ];
}

interface ConsentParams {
  clientId: string | null;
  scopes: string[];
}

function readConsentParams(search: string): ConsentParams {
  const params = new URLSearchParams(search);
  const clientId = params.get("client_id");
  const rawScope = params.get("scope") ?? "";
  const scopes = rawScope
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return { clientId, scopes };
}

interface ConsentClientApi {
  oauth2: {
    consent: (input: {
      accept: boolean;
      scope?: string;
    }) => Promise<{ data?: { redirect_uri?: string } | null; error?: unknown }>;
  };
}

interface OAuthConsentScreenProps {
  isAuthenticated: boolean;
  search: string;
  pathWithSearch: string;
}

export function OAuthConsentScreen({
  isAuthenticated,
  search,
  pathWithSearch,
}: OAuthConsentScreenProps) {
  const params = useMemo(() => readConsentParams(search), [search]);
  const [submitting, setSubmitting] = useState<"accept" | "reject" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    // Send the user to the existing AuthGate (mounted at "/") and ask it to
    // bring them back to this exact consent URL after the magic-link sign-in
    // completes. AuthGate forwards `redirectTo` as Better Auth's `callbackURL`.
    const redirectTarget = `/?redirectTo=${encodeURIComponent(pathWithSearch)}`;
    return <Navigate to={redirectTarget} replace />;
  }

  if (!params.clientId) {
    return (
      <ConsentLayout>
        <h2 className="text-2xl font-semibold">Invalid consent request</h2>
        <p className="text-muted-foreground">
          The consent URL is missing a <code>client_id</code> parameter. Please
          restart the sign-in flow from the application that brought you here.
        </p>
      </ConsentLayout>
    );
  }

  async function callConsent(accept: boolean) {
    setSubmitting(accept ? "accept" : "reject");
    setError(null);
    try {
      const client = authClient as unknown as ConsentClientApi;
      const result = await client.oauth2.consent({ accept });
      if (result?.error) {
        const message =
          typeof result.error === "object" &&
          result.error !== null &&
          "message" in result.error &&
          typeof (result.error as { message?: unknown }).message === "string"
            ? (result.error as { message: string }).message
            : "Consent request failed";
        setError(message);
        setSubmitting(null);
        return;
      }
      const redirectUri = result?.data?.redirect_uri;
      if (typeof redirectUri === "string" && redirectUri.length > 0) {
        window.location.assign(redirectUri);
        return;
      }
      // No explicit redirect_uri returned; surface that to the user instead of
      // silently doing nothing.
      setError("Consent processed but no redirect URL was returned.");
      setSubmitting(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Consent request failed";
      setError(message);
      setSubmitting(null);
    }
  }

  return (
    <ConsentLayout>
      <h2 className="text-2xl font-semibold tracking-tight">
        Authorize{" "}
        <span className="font-mono text-base bg-muted px-1.5 py-0.5 rounded">
          {params.clientId}
        </span>
      </h2>
      <p className="text-muted-foreground">
        This client is requesting permission to access your account on My Agent
        Loop with the following scopes:
      </p>
      <ul
        className="space-y-1.5 list-disc list-inside text-sm"
        data-testid="oauth-consent-scopes"
      >
        {params.scopes.length === 0 ? (
          <li className="text-muted-foreground">
            No specific scopes requested
          </li>
        ) : (
          params.scopes.map((scope) => (
            <li key={scope}>
              <code className="font-mono">{scope}</code>
            </li>
          ))
        )}
      </ul>
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          onClick={() => callConsent(true)}
          disabled={submitting !== null}
        >
          {submitting === "accept" ? "Authorizing…" : "Allow"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => callConsent(false)}
          disabled={submitting !== null}
        >
          {submitting === "reject" ? "Cancelling…" : "Cancel"}
        </Button>
      </div>
      {error !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </ConsentLayout>
  );
}

function ConsentLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Network className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            My Agent Loop
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}

export default function OAuthConsentRoute() {
  const location = useLocation();
  const authSession = authClient.useSession();
  const [resolvedSearch, setResolvedSearch] = useState<string>(location.search);

  // The Better Auth oauth-provider client plugin reads
  // `window.location.search` directly during its onRequest hook, so make sure
  // the URL we render with matches what is actually on the window.
  useEffect(() => {
    if (typeof window !== "undefined") {
      setResolvedSearch(window.location.search);
    }
  }, []);

  // Avoid flashing the unauthenticated state while the session is loading.
  if (authSession.isPending) {
    return (
      <ConsentLayout>
        <p className="text-muted-foreground">Loading…</p>
      </ConsentLayout>
    );
  }

  const pathWithSearch = `${location.pathname}${location.search}${location.hash}`;
  return (
    <OAuthConsentScreen
      isAuthenticated={authSession.data !== null}
      search={resolvedSearch || location.search}
      pathWithSearch={pathWithSearch}
    />
  );
}
