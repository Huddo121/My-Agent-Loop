import type { AgentConfig } from "@mono/api";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Kbd, KbdGroup } from "~/components/ui/kbd";
import {
  HARNESS_DEFAULT_VALUE,
  ModelSelect,
  parseModelValue,
} from "~/components/ui/ModelSelect";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useCurrentWorkspace, useHarnessesQuery } from "~/lib/workspaces";
import type { NewTask, Project, Subtask, Task } from "~/types";
import { SubtaskSection } from "./SubtaskSection";

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
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
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
        setSubtasks(task.subtasks ?? []);
        setHarnessValue(task.agentConfig?.harnessId ?? INHERIT_VALUE);
        setModelValue(task.agentConfig?.modelId ?? HARNESS_DEFAULT_VALUE);
      } else {
        setTitle("");
        setDescription("");
        setSubtasks([]);
        setHarnessValue(INHERIT_VALUE);
        setModelValue(HARNESS_DEFAULT_VALUE);
      }
    }
  }, [open, task]);

  const buildTaskPayload = useCallback((): NewTask | null => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return null;
    }

    const parsedHarnessId = parseHarnessValue(harnessValue);
    const agentConfig: AgentConfig | null =
      parsedHarnessId === null
        ? null
        : {
            harnessId: parsedHarnessId,
            modelId: parseModelValue(modelValue),
          };

    return {
      title: trimmedTitle,
      description: description.trim(),
      agentConfig,
      subtasks,
    };
  }, [title, harnessValue, modelValue, description, subtasks]);

  const submitTask = useCallback(() => {
    const taskPayload = buildTaskPayload();
    if (taskPayload === null) {
      return;
    }

    onSubmit(taskPayload);
    onOpenChange(false);
  }, [buildTaskPayload, onSubmit, onOpenChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitTask();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "Enter" && open && title.trim()) {
        e.preventDefault();
        submitTask();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, title, submitTask]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0">
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{task ? "Edit Task" : "Add Task"}</DialogTitle>
            <DialogDescription>
              {task
                ? "Edit an existing task for this project."
                : "Create a new task for this project."}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <div className="flex flex-col gap-4 px-6 py-4">
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
              <SubtaskSection
                subtasks={subtasks}
                onSubtasksChange={setSubtasks}
              />
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
          </ScrollArea>
          <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
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
