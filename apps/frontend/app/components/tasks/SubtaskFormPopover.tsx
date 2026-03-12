import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { Subtask, SubtaskId, SubtaskState } from "~/types";

const SUBTASK_STATES: SubtaskState[] = [
  "pending",
  "in-progress",
  "completed",
  "cancelled",
];

const SUBTASK_STATE_LABELS: Record<SubtaskState, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type SubtaskFormPopoverProps = {
  subtask: Subtask | null;
  onSave: (subtask: Subtask) => void;
  generateId: () => SubtaskId;
  children: React.ReactNode;
};

export function SubtaskFormPopover({
  subtask,
  onSave,
  generateId,
  children,
}: SubtaskFormPopoverProps) {
  const isEditing = subtask !== null;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(subtask?.title ?? "");
  const [description, setDescription] = useState(subtask?.description ?? "");
  const [state, setState] = useState<SubtaskState>(subtask?.state ?? "pending");

  useEffect(() => {
    if (open) {
      setTitle(subtask?.title ?? "");
      setDescription(subtask?.description ?? "");
      setState(subtask?.state ?? "pending");
    }
  }, [open, subtask?.title, subtask?.description, subtask?.state]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTitle("");
      setDescription("");
      setState("pending");
    }
    setOpen(next);
  };

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (isEditing && subtask) {
      onSave({
        ...subtask,
        title: trimmedTitle || subtask.title,
        description: description.trim() || undefined,
        state,
      });
    } else {
      onSave({
        id: generateId(),
        title: trimmedTitle || "Untitled",
        description: description.trim() || undefined,
        state,
      });
    }
    handleOpenChange(false);
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleSaveRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80" align="start" side="bottom">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="popover-subtask-title"
              className="text-sm font-medium"
            >
              Title
            </label>
            <Input
              id="popover-subtask-title"
              placeholder="Subtask title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="popover-subtask-description"
              className="text-sm font-medium"
            >
              Description (optional)
            </label>
            <textarea
              id="popover-subtask-description"
              placeholder="Add details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="flex min-h-[60px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="popover-subtask-state"
              className="text-sm font-medium"
            >
              State
            </label>
            <Select
              value={state}
              onValueChange={(v) => setState(v as SubtaskState)}
            >
              <SelectTrigger
                id="popover-subtask-state"
                size="sm"
                className="h-8"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBTASK_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SUBTASK_STATE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              {isEditing ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
