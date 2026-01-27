import type { ProjectId } from "@mono/api";
import { CheckCircle2Icon } from "lucide-react";
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
  onEdit: (task: Task) => void;
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
        {...dragHandleProps}
        ref={ref}
        className={cn(
          "transition-shadow w-[240px] py-0 gap-0 cursor-pointer",
          isDragging && "shadow-lg ring-2 ring-primary/20",
          isCompleted && "opacity-60",
        )}
        onClick={() => {
          onEdit(task)
        }}
      >
        <CardContent className="flex gap-2 py-2 px-3">
          <div className="flex-1 min-w-0 flex gap-2">
            <h3
              className={cn(
                "font-medium text-sm",
                isCompleted && "line-through text-muted-foreground",
              )}
            >
              {task.title}
            </h3>
          </div>
          <div className="w-[32px]">
            {!isCompleted && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  handleCompleteTask()
                }}
                disabled={completeTask.isPending}
                className="shrink-0 rounded-lg"
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
