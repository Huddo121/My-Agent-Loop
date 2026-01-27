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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { MoveTaskRequest, TaskId, UpdateProjectRequest } from "@mono/api";
import {
  LoaderIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  SettingsIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useStartRun, useUpdateProject } from "~/hooks";
import type { NewTask, Project, Task, UpdateTask } from "~/types";
import { ProjectDialog } from "../projects";
import { ButtonGroup } from "../ui/button-group";
import { SortableTaskCard } from "./SortableTaskCard";
import { TaskDialog } from "./TaskDialog";

export type TaskQueueProps = {
  project: Project;
  tasks: Task[];
  onMoveTask: (taskId: TaskId, request: MoveTaskRequest) => void;
  onAddTask: (task: NewTask) => void;
  onUpdateTask: (taskId: string, task: UpdateTask) => void;
  isLoading?: boolean;
};

export function TaskQueue({
  project,
  tasks,
  onMoveTask,
  onAddTask,
  onUpdateTask,
  isLoading = false,
}: TaskQueueProps) {
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const taskId = active.id as TaskId;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const overIndex = tasks.findIndex((t) => t.id === over.id);

    // Calculate the new index after the move
    // If moving down, the task goes after the target; if moving up, it goes before
    const newIndex = oldIndex < overIndex ? overIndex : overIndex;

    // Determine the move request based on the new position
    let moveRequest: MoveTaskRequest;

    if (newIndex === 0) {
      // Moving to first position
      moveRequest = { method: "absolute", position: "first" };
    } else if (newIndex === tasks.length - 1) {
      // Moving to last position
      moveRequest = { method: "absolute", position: "last" };
    } else {
      // Moving between two tasks
      // The task at overIndex in the original array becomes our reference point
      // If we're moving down (oldIndex < overIndex), we insert after the over item
      // If we're moving up (oldIndex > overIndex), we insert before the over item
      let afterTask: Task;
      let beforeTask: Task;

      if (oldIndex < overIndex) {
        // Moving down: insert after the 'over' task
        // after = task at overIndex, before = task at overIndex + 1
        afterTask = tasks[overIndex];
        beforeTask = tasks[overIndex + 1];
      } else {
        // Moving up: insert before the 'over' task
        // after = task at overIndex - 1, before = task at overIndex
        afterTask = tasks[overIndex - 1];
        beforeTask = tasks[overIndex];
      }

      moveRequest = {
        method: "relative",
        after: afterTask.id as TaskId,
        before: beforeTask.id as TaskId,
      };
    }

    onMoveTask(taskId, moveRequest);
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
    setTaskDialogOpen(true);
  };

  const updateProjectMutation = useUpdateProject();

  const handleUpdateProject = useCallback(
    (updateProjectRequest: UpdateProjectRequest) => {
      updateProjectMutation.mutate({
        projectId: project.id,
        updateProjectRequest,
      });
    },
    [updateProjectMutation, project.id],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 gap-2">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {tasks.length} {tasks.length === 1 ? "task" : "tasks"} in queue
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipContent>Project settings</TooltipContent>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setProjectDialogOpen(true)}
                >
                  <SettingsIcon className="size-4" />
                  <span className="sr-only">Project settings</span>
                </Button>
              </TooltipTrigger>
            </Tooltip>
            <ButtonGroup>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => handleStartRun("single")}
                    disabled={startRunMutation.isPending}
                  >
                    <PlayIcon className="size-4" />
                    <span className="sr-only">Start next task</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Start next task</TooltipContent>
              </Tooltip>
              {project.workflowConfiguration.onTaskCompleted ===
                "merge-immediately" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => handleStartRun("loop")}
                      disabled={startRunMutation.isPending}
                    >
                      <RepeatIcon className="size-4" />
                      <span className="sr-only">Start looping over tasks</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Start looping over tasks</TooltipContent>
                </Tooltip>
              )}
            </ButtonGroup>
          </div>
        </div>
        <Tooltip>
          <TooltipContent>Add task</TooltipContent>
          <TooltipTrigger asChild>
            <Button onClick={() => setTaskDialogOpen(true)}>
              <PlusIcon className="size-4" />
              <span className="hidden md:inline">Add Task</span>
            </Button>
          </TooltipTrigger>
        </Tooltip>
      </div>
      <ScrollArea className="min-h-full">
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
                onClick={() => setTaskDialogOpen(true)}
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
        open={taskDialogOpen}
        onOpenChange={(open) => {
          setTaskDialogOpen(open);
          if (!open) {
            setEditingTask(undefined);
          }
        }}
        onSubmit={handleAddTask}
        task={editingTask}
      />
      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        mode={"update"}
        initialName={project.name}
        initialShortCode={project.shortCode}
        initialRepositoryUrl={project.repositoryUrl}
        initialWorkflowConfiguration={project.workflowConfiguration}
        onSubmit={handleUpdateProject}
      />
    </div>
  );
}
