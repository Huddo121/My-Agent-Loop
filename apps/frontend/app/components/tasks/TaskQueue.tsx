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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LoaderIcon, PlayIcon, PlusIcon, RepeatIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useStartRun } from "~/hooks";
import type { NewTask, Project, Task, UpdateTask } from "~/types";
import { SortableTaskCard } from "./SortableTaskCard";
import { TaskDialog } from "./TaskDialog";

export type TaskQueueProps = {
  project: Project;
  tasks: Task[];
  onTasksReorder: (tasks: Task[]) => void;
  onAddTask: (task: NewTask) => void;
  onUpdateTask: (taskId: string, task: UpdateTask) => void;
  isLoading?: boolean;
};

export function TaskQueue({
  project,
  tasks,
  onTasksReorder,
  onAddTask,
  onUpdateTask,
  isLoading = false,
}: TaskQueueProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const startRunMutation = useStartRun();

  const handleStartRun = (mode: "single" | "loop") => {
    startRunMutation.mutate(
      { projectId: project.id, mode },
      {
        onError: (error) => {
          console.error("Failed to start run:", error);
        },
      },
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      const newTasks = arrayMove(tasks, oldIndex, newIndex);
      onTasksReorder(newTasks);
    }
  };

  const handleAddTask = (newTask: NewTask) => {
    if (editingTask) {
      onUpdateTask(editingTask.id, newTask);
      setEditingTask(undefined);
    } else {
      onAddTask(newTask);
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {tasks.length} {tasks.length === 1 ? "task" : "tasks"} in queue
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleStartRun("single")}
                  disabled={startRunMutation.isPending}
                >
                  <PlayIcon className="size-4" />
                  <span className="sr-only">Start single run</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Start single run</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleStartRun("loop")}
                  disabled={startRunMutation.isPending}
                >
                  <RepeatIcon className="size-4" />
                  <span className="sr-only">Start loop run</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Start loop run</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <PlusIcon className="size-4" />
          Add Task
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">
                No tasks in this project yet.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setDialogOpen(true)}
              >
                <PlusIcon className="size-4" />
                Add your first task
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={tasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-3">
                  {tasks.map((task) => (
                    <SortableTaskCard
                      key={task.id}
                      task={task}
                      projectId={project.id}
                      onEdit={handleEditTask}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </ScrollArea>
      <TaskDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingTask(undefined);
          }
        }}
        onSubmit={handleAddTask}
        task={editingTask}
      />
    </div>
  );
}
