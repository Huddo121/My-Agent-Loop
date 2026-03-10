import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  HarnessSelect,
  INHERIT_VALUE,
  parseHarnessValue,
} from "~/components/ui/HarnessSelect";
import { Input } from "~/components/ui/input";
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

  const systemDefaultDisplayName = useMemo(() => "OpenCode", []);

  useEffect(() => {
    if (open) {
      setName(workspace.name);
      setHarnessValue(workspace.agentHarnessId ?? SYSTEM_DEFAULT_VALUE);
    }
  }, [open, workspace.name, workspace.agentHarnessId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const agentHarnessId = parseHarnessValue(
      harnessValue === SYSTEM_DEFAULT_VALUE ? INHERIT_VALUE : harnessValue,
    );

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
              <div className="mt-1">
                <HarnessSelect
                  id="workspace-config-harness"
                  value={
                    harnessValue === SYSTEM_DEFAULT_VALUE
                      ? INHERIT_VALUE
                      : harnessValue
                  }
                  onValueChange={(value) => {
                    setHarnessValue(
                      value === INHERIT_VALUE ? SYSTEM_DEFAULT_VALUE : value,
                    );
                  }}
                  harnesses={harnesses}
                  isLoading={isLoadingHarnesses}
                  inheritDisplayName={systemDefaultDisplayName}
                  inheritLabel="System default"
                />
              </div>
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
