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
import {
  HARNESS_DEFAULT_VALUE,
  ModelSelect,
  parseModelValue,
} from "~/components/ui/ModelSelect";
import { Input } from "~/components/ui/input";
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import { useCurrentWorkspace, useHarnessesQuery } from "~/lib/workspaces";
import type { NewTask, Project, Task } from "~/types";

export type TaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (task: NewTask) => void;
  project: Project;
  task?: Task;
};

export function TaskDialog({
  open,
  onOpenChange,
  onSubmit,
  project,
  task,
}: TaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [harnessValue, setHarnessValue] = useState<string>(INHERIT_VALUE);
  const [modelValue, setModelValue] = useState<string>(HARNESS_DEFAULT_VALUE);

  const workspace = useCurrentWorkspace();
  const { data: harnessesData, isLoading: isLoadingHarnesses } =
    useHarnessesQuery(workspace.id);
  const harnesses = harnessesData?.harnesses ?? [];

  const inheritDisplayName = useMemo(() => {
    const projectHarnessId =
      project.agentConfig?.harnessId ??
      workspace.agentConfig?.harnessId ??
      "opencode";
    return (
      harnesses.find((h) => h.id === projectHarnessId)?.displayName ??
      projectHarnessId
    );
  }, [project.agentConfig, workspace.agentConfig, harnesses]);

  const modelsForSelectedHarness = useMemo(() => {
    if (harnessValue === INHERIT_VALUE) return [];
    const harnessId = parseHarnessValue(harnessValue);
    if (harnessId === null) return [];
    const harness = harnesses.find((h) => h.id === harnessId);
    return harness?.models ?? [];
  }, [harnessValue, harnesses]);

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description);
        setHarnessValue(task.agentConfig?.harnessId ?? INHERIT_VALUE);
        setModelValue(task.agentConfig?.modelId ?? HARNESS_DEFAULT_VALUE);
      } else {
        setTitle("");
        setDescription("");
        setHarnessValue(INHERIT_VALUE);
        setModelValue(HARNESS_DEFAULT_VALUE);
      }
    }
  }, [open, task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      const parsedHarnessId = parseHarnessValue(harnessValue);
      const agentConfig: AgentConfig | null =
        parsedHarnessId === null
          ? null
          : {
              harnessId: parsedHarnessId,
              modelId: parseModelValue(modelValue),
            };
      onSubmit({
        title: title.trim(),
        description: description.trim(),
        agentConfig,
      });
      onOpenChange(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "Enter" && open && title.trim()) {
        e.preventDefault();
        const parsedHarnessId = parseHarnessValue(harnessValue);
        const agentConfig: AgentConfig | null =
          parsedHarnessId === null
            ? null
            : {
                harnessId: parsedHarnessId,
                modelId: parseModelValue(modelValue),
              };
        onSubmit({
          title: title.trim(),
          description: description.trim(),
          agentConfig,
        });
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, title, description, harnessValue, modelValue, onSubmit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{task ? "Edit Task" : "Add Task"}</DialogTitle>
            <DialogDescription>
              {task
                ? "Edit an existing task for this project."
                : "Create a new task for this project."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="title"
                placeholder="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                placeholder="Task description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="task-harness" className="text-sm font-medium">
                Agent Harness
              </label>
              <p className="text-xs text-muted-foreground -mt-1">
                Overrides the project default for this task only.
              </p>
              <HarnessSelect
                id="task-harness"
                value={harnessValue}
                onValueChange={(value) => {
                  setHarnessValue(value);
                  setModelValue(HARNESS_DEFAULT_VALUE);
                }}
                harnesses={harnesses}
                isLoading={isLoadingHarnesses}
                inheritDisplayName={inheritDisplayName}
                inheritLabel="Inherit from project"
              />
              {harnessValue !== INHERIT_VALUE && (
                <div className="mt-2">
                  <label
                    htmlFor="task-model"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Model
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                    Used when this task selects a specific harness.
                  </p>
                  <ModelSelect
                    id="task-model"
                    value={modelValue}
                    onValueChange={setModelValue}
                    models={modelsForSelectedHarness}
                    isLoading={isLoadingHarnesses}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <div className="flex flex-col items-center gap-2">
              <Button type="submit" disabled={!title.trim()}>
                {task ? "Update Task" : "Add Task"}
              </Button>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>Enter</Kbd>
                </KbdGroup>
                <span>to submit</span>
              </div>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
