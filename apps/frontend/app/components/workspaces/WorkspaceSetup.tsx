import { Network } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useBootstrapWorkspace } from "~/lib/auth";

export interface WorkspaceSetupProps {
  onSuccess?: () => void;
}

const FEATURES = [
  "Drag-and-drop task prioritization",
  "Real-time agent progress tracking",
  "Multiple workspace support",
];

const RINGS = [
  { size: 720, rightOffset: -320, delay: "0s", opacity: "border-white/[0.07]" },
  { size: 520, rightOffset: -220, delay: "2s", opacity: "border-white/[0.10]" },
  { size: 320, rightOffset: -120, delay: "4s", opacity: "border-white/[0.14]" },
];

const NODES = [
  {
    top: "calc(50% - 160px)",
    right: "-120px",
    delay: "0s",
    size: "w-2.5 h-2.5",
  },
  { top: "50%", right: "-120px", delay: "1.5s", size: "w-3.5 h-3.5" },
  {
    top: "calc(50% + 160px)",
    right: "-120px",
    delay: "0.75s",
    size: "w-2 h-2",
  },
];

export function WorkspaceSetup({ onSuccess }: WorkspaceSetupProps) {
  const [name, setName] = useState("");
  const createWorkspace = useBootstrapWorkspace();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      createWorkspace.mutate(
        { name: name.trim() },
        { onSuccess: () => onSuccess?.() },
      );
    }
  };

  return (
    <div className="min-h-screen w-full flex">
      {/* Left: Branding panel */}
      <div className="hidden lg:flex relative flex-col w-120 bg-primary text-primary-foreground p-16">
        {/* Decorative layer — overflow-hidden scoped here so text is never clipped */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Dot grid texture */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle, rgb(255 255 255 / 0.13) 1px, transparent 1px)`,
              backgroundSize: "28px 28px",
            }}
          />

          {/* Orbital rings */}
          {RINGS.map((ring) => (
            <div
              key={ring.size}
              className={`absolute rounded-full border ${ring.opacity}`}
              style={{
                width: `${ring.size}px`,
                height: `${ring.size}px`,
                top: "50%",
                right: `${ring.rightOffset}px`,
                marginTop: `-${ring.size / 2}px`,
                animation: `workspace-ring-pulse 8s ease-in-out infinite ${ring.delay}`,
              }}
            />
          ))}

          {/* Glowing nodes on rightmost ring */}
          {NODES.map((node) => (
            <div
              key={node.delay}
              className={`absolute rounded-full bg-white/50 ${node.size}`}
              style={{
                top: node.top,
                right: node.right,
                animation: `workspace-node-blink 4s ease-in-out infinite ${node.delay}`,
              }}
            />
          ))}

          {/* Subtle ambient gradient overlay */}
          <div className="absolute inset-0 bg-linear-to-br from-white/5 via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Logo mark */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center">
              <Network className="w-4 h-4 text-white" />
            </div>
            <span className="text-white/60 text-xs font-semibold tracking-[0.2em] uppercase">
              My Agent Loop
            </span>
          </div>

          {/* Hero headline */}
          <div className="mt-auto mb-auto">
            <h1
              className="text-[3.25rem] font-semibold leading-[1.08] tracking-tight"
              style={{ fontFamily: "'Geologica', sans-serif" }}
            >
              <span>Orchestrate</span>
              <br />
              <span className="z-10">your agents.</span>
              <br />
              <span className="text-white/45 z-0">Ship faster.</span>
            </h1>
            <p className="mt-6 text-white/55 text-lg leading-relaxed max-w-88">
              Define projects, queue tasks, and let your AI agents handle
              execution while you stay in control.
            </p>
          </div>

          {/* Feature list */}
          <div className="flex flex-col gap-2.5">
            {FEATURES.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-3 text-white/40 text-sm"
              >
                <div className="w-1 h-1 rounded-full bg-white/35 shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Form panel */}
      <div className="flex-1 flex items-center justify-center bg-background p-8">
        <div
          className="w-full max-w-sm"
          style={{ animation: "workspace-fade-up 0.45s ease-out both" }}
        >
          {/* Mobile-only logo */}
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
              Set up your
              <br />
              workspace
            </h2>
            <p className="mt-2.5 text-muted-foreground leading-relaxed">
              Name your first workspace now that your account is signed in.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="workspace-name" className="text-sm font-medium">
                Workspace name
              </label>
              <Input
                id="workspace-name"
                placeholder="My Workspace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                disabled={createWorkspace.isPending}
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={!name.trim() || createWorkspace.isPending}
              className="w-full h-11 font-semibold"
            >
              {createWorkspace.isPending ? "Creating…" : "Create workspace"}
            </Button>
            {createWorkspace.isError && (
              <p className="text-sm text-destructive">
                {createWorkspace.error?.message ?? "Failed to create workspace"}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
