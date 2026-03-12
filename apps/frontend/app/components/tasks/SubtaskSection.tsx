import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { Subtask, SubtaskId, SubtaskState } from "~/types";
import { SubtaskFormPopover } from "./SubtaskFormPopover";

const generateSubtaskId = (): SubtaskId =>
  crypto.randomUUID().slice(0, 8) as SubtaskId;

const SUBTASK_STATE_LABELS: Record<SubtaskState, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const SUBTASK_STATE_VARIANTS: Record<
  SubtaskState,
  "secondary" | "default" | "destructive" | "outline"
> = {
  pending: "secondary",
  "in-progress": "default",
  completed: "outline",
  cancelled: "destructive",
};

const SUBTASK_STATE_BADGE_CLASS: Partial<Record<SubtaskState, string>> = {
  completed:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

type SortableSubtaskRowProps = {
  subtask: Subtask;
  onSave: (subtask: Subtask) => void;
  onRemove: (id: SubtaskId) => void;
  generateId: () => SubtaskId;
};

function SortableSubtaskRow({
  subtask,
  onSave,
  onRemove,
  generateId,
}: SortableSubtaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1.5 rounded border bg-background px-2 py-1.5 transition-opacity",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="touch-none cursor-grab rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-xs" title={subtask.title}>
        {subtask.title || "Untitled"}
      </span>
      <Badge
        variant={SUBTASK_STATE_VARIANTS[subtask.state]}
        className={cn(
          "shrink-0 px-1.5 py-0 text-[10px]",
          SUBTASK_STATE_BADGE_CLASS[subtask.state],
        )}
      >
        {SUBTASK_STATE_LABELS[subtask.state]}
      </Badge>
      <SubtaskFormPopover
        subtask={subtask}
        onSave={onSave}
        generateId={generateId}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Edit subtask"
          className="size-6"
        >
          <PencilIcon data-icon="inline-start" className="size-3" />
        </Button>
      </SubtaskFormPopover>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove subtask"
        className="size-6"
        onClick={() => onRemove(subtask.id)}
      >
        <Trash2Icon data-icon="inline-start" className="size-3" />
      </Button>
    </div>
  );
}

export type SubtaskSectionProps = {
  subtasks: Subtask[];
  onSubtasksChange: (subtasks: Subtask[]) => void;
};

export function SubtaskSection({
  subtasks,
  onSubtasksChange,
}: SubtaskSectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const overIndex = subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || overIndex === -1) return;

    const reordered = arrayMove(subtasks, oldIndex, overIndex);
    onSubtasksChange(reordered);
  };

  const handleSaveSubtask = (subtask: Subtask, existingId?: SubtaskId) => {
    if (existingId) {
      onSubtasksChange(
        subtasks.map((s) => (s.id === existingId ? subtask : s)),
      );
    } else {
      onSubtasksChange([...subtasks, subtask]);
    }
  };

  const handleRemoveSubtask = (id: SubtaskId) => {
    onSubtasksChange(subtasks.filter((s) => s.id !== id));
  };

  const pendingCount = subtasks.filter((s) => s.state === "pending").length;
  const inProgressCount = subtasks.filter(
    (s) => s.state === "in-progress",
  ).length;
  const doneCount = subtasks.filter(
    (s) => s.state === "completed" || s.state === "cancelled",
  ).length;

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <span className="text-sm font-medium">
          Subtasks
          {subtasks.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1.5 cursor-default font-mono text-xs tabular-nums">
                  <span className="text-muted-foreground">{pendingCount}</span>
                  <span className="text-muted-foreground/70">/</span>
                  <span className="text-primary">{inProgressCount}</span>
                  <span className="text-muted-foreground/70">/</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {doneCount}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {pendingCount} pending / {inProgressCount} in progress /{" "}
                {doneCount} done (completed + cancelled)
              </TooltipContent>
            </Tooltip>
          )}
        </span>
        <SubtaskFormPopover
          subtask={null}
          onSave={(s) => handleSaveSubtask(s)}
          generateId={generateSubtaskId}
        >
          <Button type="button" variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" />
            Add subtask
          </Button>
        </SubtaskFormPopover>
      </div>
      <div className="h-[200px] min-h-0 shrink-0 overflow-y-auto overscroll-contain pr-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={subtasks.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1.5">
              {subtasks.map((subtask) => (
                <SortableSubtaskRow
                  key={subtask.id}
                  subtask={subtask}
                  onSave={(s) => handleSaveSubtask(s, subtask.id)}
                  onRemove={handleRemoveSubtask}
                  generateId={generateSubtaskId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
