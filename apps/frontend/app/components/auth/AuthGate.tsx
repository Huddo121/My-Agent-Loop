import { Network } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useMagicLinkSignIn } from "~/lib/auth";

export function AuthGate() {
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const signIn = useMagicLinkSignIn();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length === 0) {
      return;
    }
    signIn.mutate(
      {
        email: normalizedEmail,
        callbackURL: window.location.origin,
      },
      {
        onSuccess: () => {
          setSubmittedEmail(normalizedEmail);
        },
      },
    );
  };

  return (
    <div className="min-h-screen w-full flex">
      <div className="hidden lg:flex relative flex-col w-120 bg-primary text-primary-foreground p-16">
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center">
              <Network className="w-4 h-4 text-white" />
            </div>
            <span className="text-white/60 text-xs font-semibold tracking-[0.2em] uppercase">
              My Agent Loop
            </span>
          </div>

          <div className="mt-auto mb-auto">
            <h1
              className="text-[3.25rem] font-semibold leading-[1.08] tracking-tight"
              style={{ fontFamily: "'Geologica', sans-serif" }}
            >
              <span>Sign in to</span>
              <br />
              <span>your agent loop.</span>
            </h1>
            <p className="mt-6 text-white/55 text-lg leading-relaxed max-w-88">
              We will issue a magic link and log it on the server so the
              operator can open it.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Network className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xs font-semibold tracking-[0.18em] uppercase text-muted-foreground">
              My Agent Loop
            </span>
          </div>

          <div className="mb-8">
            <h2
              className="text-[2rem] font-semibold tracking-tight leading-tight"
              style={{ fontFamily: "'Geologica', sans-serif" }}
            >
              Sign in with a
              <br />
              magic link
            </h2>
            <p className="mt-2.5 text-muted-foreground leading-relaxed">
              Enter your email address to request a sign-in link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="auth-email" className="text-sm font-medium">
                Email address
              </label>
              <Input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
                disabled={signIn.isPending}
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={!email.trim() || signIn.isPending}
              className="w-full h-11 font-semibold"
            >
              {signIn.isPending ? "Sending…" : "Send magic link"}
            </Button>
            {submittedEmail !== null ? (
              <p className="text-sm text-muted-foreground">
                Magic link requested for {submittedEmail}. Check the server log
                to open it.
              </p>
            ) : null}
            {signIn.isError ? (
              <p className="text-sm text-destructive">
                {signIn.error?.message ?? "Failed to send magic link"}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
