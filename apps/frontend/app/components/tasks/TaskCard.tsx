import type { ProjectId } from "@mono/api";
import { CheckCircle2Icon, Edit2Icon, GripVerticalIcon } from "lucide-react";
import { forwardRef } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { useCompleteTask } from "~/hooks/useTasks";
import { cn } from "~/lib/utils";
import type { Task } from "~/types";

export type TaskCardProps = {
  task: Task;
  projectId: ProjectId;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onEdit?: (task: Task) => void;
};

export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(
  function TaskCard(
    { task, projectId, isDragging, dragHandleProps, onEdit },
    ref,
  ) {
    const isCompleted = task.completedOn != null;
    const completeTask = useCompleteTask(projectId);

    const handleCompleteTask = () => {
      if (!isCompleted) {
        completeTask.mutate(task.id);
      }
    };

    return (
      <Card
        ref={ref}
        className={cn(
          "transition-shadow",
          isDragging && "shadow-lg ring-2 ring-primary/20",
          isCompleted && "opacity-60",
        )}
      >
        <CardContent className="flex items-start gap-3 py-3 px-4">
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          >
            <GripVerticalIcon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isCompleted && (
                <CheckCircle2Icon className="size-4 text-green-600 shrink-0" />
              )}
              <h3
                className={cn(
                  "font-medium text-sm truncate",
                  isCompleted && "line-through text-muted-foreground",
                )}
              >
                {task.title}
              </h3>
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onEdit?.(task)}
              className="shrink-0 mt-0.5"
              title="Edit task"
            >
              <Edit2Icon className="size-4" />
            </Button>
            {!isCompleted && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={handleCompleteTask}
                disabled={completeTask.isPending}
                className="shrink-0 mt-0.5"
                title="Mark as completed"
              >
                <CheckCircle2Icon className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  },
);
