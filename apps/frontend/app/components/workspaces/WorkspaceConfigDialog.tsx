import type { AgentHarnessId } from "@mono/api";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  useHarnessesQuery,
  useUpdateWorkspace,
} from "~/lib/workspaces/useWorkspaces";
import type { Workspace } from "~/types";

const SYSTEM_DEFAULT_VALUE = "__default__" as const;

export type WorkspaceConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
};

export function WorkspaceConfigDialog({
  open,
  onOpenChange,
  workspace,
}: WorkspaceConfigDialogProps) {
  const [name, setName] = useState(workspace.name);
  const [harnessValue, setHarnessValue] = useState<string>(
    workspace.agentHarnessId ?? SYSTEM_DEFAULT_VALUE,
  );

  const { data: harnessesData, isLoading: isLoadingHarnesses } =
    useHarnessesQuery(workspace.id);
  const updateWorkspace = useUpdateWorkspace(workspace.id);

  const harnesses = harnessesData?.harnesses ?? [];

  useEffect(() => {
    if (open) {
      setName(workspace.name);
      setHarnessValue(workspace.agentHarnessId ?? SYSTEM_DEFAULT_VALUE);
    }
  }, [open, workspace.name, workspace.agentHarnessId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const agentHarnessId: AgentHarnessId | null =
      harnessValue === SYSTEM_DEFAULT_VALUE
        ? null
        : (harnessValue as AgentHarnessId);

    updateWorkspace.mutate(
      { name: name.trim(), agentHarnessId },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  const canSubmit = name.trim().length > 0;
  const isPending = updateWorkspace.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Workspace settings</DialogTitle>
            <DialogDescription>
              Set the workspace name and default agent harness for new tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label
                htmlFor="workspace-config-name"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Workspace name
              </label>
              <Input
                id="workspace-config-name"
                placeholder="My workspace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="workspace-config-harness"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Default agent harness
              </label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                Used when a project or task does not override it.
              </p>
              <Select
                value={harnessValue}
                onValueChange={setHarnessValue}
                disabled={isLoadingHarnesses}
              >
                <SelectTrigger
                  id="workspace-config-harness"
                  className="mt-1 w-full"
                >
                  <SelectValue placeholder="Loading…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SYSTEM_DEFAULT_VALUE}>
                    System default (OpenCode)
                  </SelectItem>
                  {harnesses.map((h) => (
                    <SelectItem
                      key={h.id}
                      value={h.id}
                      disabled={!h.isAvailable}
                    >
                      <span className="flex items-center gap-2">
                        <span>{h.displayName}</span>
                        {!h.isAvailable && (
                          <span className="text-muted-foreground text-xs font-normal">
                            — API key not set
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {updateWorkspace.isError && (
              <p className="text-sm text-destructive">
                {updateWorkspace.error?.message}
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
