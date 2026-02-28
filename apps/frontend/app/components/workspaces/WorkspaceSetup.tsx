import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useCreateWorkspace } from "~/lib/workspaces";

export interface WorkspaceSetupProps {
  onSuccess?: () => void;
}

export function WorkspaceSetup({ onSuccess }: WorkspaceSetupProps) {
  const [name, setName] = useState("");
  const createWorkspace = useCreateWorkspace();

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
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set up your workspace</CardTitle>
          <CardDescription>
            Create a workspace to get started. You can add projects and tasks
            after this.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="workspace-name"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Workspace name
              </label>
              <Input
                id="workspace-name"
                placeholder="My Workspace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="mt-1"
                disabled={createWorkspace.isPending}
              />
            </div>
            <Button
              type="submit"
              disabled={!name.trim() || createWorkspace.isPending}
              className="w-full"
            >
              {createWorkspace.isPending ? "Creating…" : "Create workspace"}
            </Button>
            {createWorkspace.isError && (
              <p className="text-sm text-destructive">
                {createWorkspace.error?.message ?? "Failed to create workspace"}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
