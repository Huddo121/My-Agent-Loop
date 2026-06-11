import type { AgentConfig } from "@mono/api";
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
  HARNESS_DEFAULT_VALUE,
  ModelSelect,
  parseModelValue,
} from "~/components/ui/ModelSelect";
import {
  parseSandboxTypeValue,
  SANDBOX_TYPE_DEFAULT_VALUE,
  SandboxTypeSelect,
} from "~/components/ui/SandboxTypeSelect";
import {
  useSetWorkspaceSandboxType,
  useWorkspaceSandboxTypeQuery,
} from "~/lib/sandbox/useSandboxType";
import {
  useHarnessesQuery,
  useUpdateWorkspace,
} from "~/lib/workspaces/useWorkspaces";
import type { Workspace } from "~/types";

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
    workspace.agentConfig?.harnessId ?? INHERIT_VALUE,
  );
  const [modelValue, setModelValue] = useState<string>(
    workspace.agentConfig?.modelId ?? HARNESS_DEFAULT_VALUE,
  );
  // null = the user has not touched the select yet, so it displays whatever the query returns.
  // Keeping the query data out of the reset effect below matters: making the effect depend on it
  // would re-run the reset when the query resolves after the dialog opened, wiping any name or
  // harness edits the user made in the meantime.
  const [sandboxTypeValue, setSandboxTypeValue] = useState<string | null>(
    null,
  );

  const { data: harnessesData, isLoading: isLoadingHarnesses } =
    useHarnessesQuery(workspace.id);
  const { data: sandboxTypeData, isLoading: isLoadingSandboxType } =
    useWorkspaceSandboxTypeQuery(workspace.id);
  const updateWorkspace = useUpdateWorkspace(workspace.id);
  const setWorkspaceSandboxType = useSetWorkspaceSandboxType(workspace.id);

  const harnesses = harnessesData?.harnesses ?? [];

  const systemDefaultDisplayName = useMemo(() => "OpenCode", []);

  const modelsForSelectedHarness = useMemo(() => {
    if (harnessValue === INHERIT_VALUE) return [];
    const harnessId = parseHarnessValue(harnessValue);
    if (harnessId === null) return [];
    const harness = harnesses.find((h) => h.id === harnessId);
    return harness?.models ?? [];
  }, [harnessValue, harnesses]);

  useEffect(() => {
    if (open) {
      setName(workspace.name);
      setHarnessValue(workspace.agentConfig?.harnessId ?? INHERIT_VALUE);
      setModelValue(workspace.agentConfig?.modelId ?? HARNESS_DEFAULT_VALUE);
      // Back to "untouched": display follows the query data again.
      setSandboxTypeValue(null);
    }
  }, [open, workspace.name, workspace.agentConfig]);

  const displayedSandboxTypeValue =
    sandboxTypeValue ?? sandboxTypeData?.sandboxType ?? SANDBOX_TYPE_DEFAULT_VALUE;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedHarnessId = parseHarnessValue(harnessValue);
    const agentConfig: AgentConfig | null =
      parsedHarnessId === null
        ? null
        : {
            harnessId: parsedHarnessId,
            modelId: parseModelValue(modelValue),
          };

    // Close only once BOTH saves succeed. Closing on the workspace update alone would hide the
    // error paragraph below while the sandbox-type save was still pending or had failed.
    Promise.all([
      setWorkspaceSandboxType.mutateAsync({
        sandboxType: parseSandboxTypeValue(displayedSandboxTypeValue),
      }),
      updateWorkspace.mutateAsync({ name: name.trim(), agentConfig }),
    ])
      .then(() => onOpenChange(false))
      .catch(() => {
        // The failure is already surfaced through each mutation's error state rendered below;
        // keeping the dialog open is the handling.
      });
  };

  const canSubmit = name.trim().length > 0;
  const isPending =
    updateWorkspace.isPending || setWorkspaceSandboxType.isPending;

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
                  value={harnessValue}
                  onValueChange={(value) => {
                    setHarnessValue(value);
                    setModelValue(HARNESS_DEFAULT_VALUE);
                  }}
                  harnesses={harnesses}
                  isLoading={isLoadingHarnesses}
                  inheritDisplayName={systemDefaultDisplayName}
                  inheritLabel="System default"
                />
              </div>
              {harnessValue !== INHERIT_VALUE && (
                <div className="mt-4">
                  <label
                    htmlFor="workspace-config-model"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Default model
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                    Used when the selected harness is active for this workspace.
                  </p>
                  <div className="mt-1">
                    <ModelSelect
                      id="workspace-config-model"
                      value={modelValue}
                      onValueChange={setModelValue}
                      models={modelsForSelectedHarness}
                      isLoading={isLoadingHarnesses}
                    />
                  </div>
                </div>
              )}
            </div>
            <div>
              <label
                htmlFor="workspace-config-sandbox-type"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Sandbox type
              </label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                Used when a project does not override it.
              </p>
              <div className="mt-1">
                <SandboxTypeSelect
                  id="workspace-config-sandbox-type"
                  value={displayedSandboxTypeValue}
                  onValueChange={setSandboxTypeValue}
                  isLoading={isLoadingSandboxType}
                  nullOptionLabel="System default (Docker)"
                />
              </div>
            </div>
            {(updateWorkspace.isError || setWorkspaceSandboxType.isError) && (
              <p className="text-sm text-destructive">
                {updateWorkspace.error?.message ??
                  setWorkspaceSandboxType.error?.message}
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
