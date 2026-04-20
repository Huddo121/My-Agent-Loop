import type { ProjectId } from "@mono/api";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { forwardRef } from "react";
import { Badge } from "~/components/ui/badge";
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
  onEdit: (task: Task) => void;
};

export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(
  function TaskCard(
    { task, projectId, isDragging, dragHandleProps, onEdit },
    ref,
  ) {
    const isCompleted = task.completedOn != null;
    const activeRun = task.activeRunState;
    const completeTask = useCompleteTask(projectId);

    const hasSubtasks = task.subtasks.length > 0;
    const doneCount = hasSubtasks
      ? task.subtasks.filter(
          (s) => s.state === "completed" || s.state === "cancelled",
        ).length
      : 0;
    const totalSubtasks = task.subtasks.length;

    const handleCompleteTask = () => {
      if (!isCompleted) {
        completeTask.mutate(task.id);
      }
    };

    return (
      <Card
        {...dragHandleProps}
        ref={ref}
        className={cn(
          "transition-shadow w-[240px] py-0 gap-0 cursor-pointer",
          isDragging && "shadow-lg ring-2 ring-primary/20",
          isCompleted && "opacity-60",
          activeRun === "in_progress" &&
            "ring-2 ring-primary/35 border-primary/25",
        )}
        onClick={() => {
          onEdit(task);
        }}
      >
        <CardContent className="flex flex-col gap-2 py-2 px-3">
          <div className="flex gap-2 items-start">
            <h3
              className={cn(
                "flex-1 min-w-0 font-medium text-sm",
                isCompleted && "line-through text-muted-foreground",
              )}
            >
              {task.title}
            </h3>
            <div className="flex shrink-0 items-center gap-1">
              {!isCompleted && activeRun === "in_progress" && (
                <Badge
                  variant="secondary"
                  className="gap-1 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide"
                >
                  <Loader2Icon className="size-3 animate-spin" aria-hidden />
                  Active
                </Badge>
              )}
              {!isCompleted && activeRun === "pending" && (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Queued
                </Badge>
              )}
              {!isCompleted && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    handleCompleteTask();
                  }}
                  disabled={completeTask.isPending}
                  className="shrink-0 rounded-lg"
                  title="Mark as completed"
                >
                  <CheckCircle2Icon className="size-4" />
                </Button>
              )}
            </div>
          </div>
          {hasSubtasks && (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${totalSubtasks > 0 ? (doneCount / totalSubtasks) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                {doneCount}/{totalSubtasks} subtasks
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
);
