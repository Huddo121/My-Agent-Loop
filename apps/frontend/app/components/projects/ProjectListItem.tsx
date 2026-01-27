import { PencilIcon, PlayIcon, RepeatIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useStartRun } from "~/hooks";
import { cn } from "~/lib/utils";
import type { Project } from "~/types";
import { ButtonGroup } from "../ui/button-group";

export type ProjectListItemProps = {
  project: Project;
  isSelected: boolean;
  onSelect: (project: Project) => void;
  onSave: (project: Project) => void;
};

export function ProjectListItem({
  project,
  isSelected,
  onSelect,
  onSave,
}: ProjectListItemProps) {
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

  return (
    <div
      className={cn(
        "group/project-item flex justify-between w-full items-center rounded-md transition-colors gap-1 p-1",
        isSelected
          ? "bg-sidebar-accent/50 text-sidebar-accent-foreground"
          : undefined,
      )}
    >
      <Tooltip>
        <TooltipContent>{project.name}</TooltipContent>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex-1 truncate px-3 py-2 text-left justify-start text-sm font-medium"
            onClick={() => onSelect(project)}
          >
            <div className="flex gap-2 items-baseline">
              <span className="text-xs text-muted-foreground font-mono">
                {project.shortCode}
              </span>
              <span className="truncate text-ellipsis">{project.name}</span>
            </div>
          </Button>
        </TooltipTrigger>
      </Tooltip>
      <ButtonGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover/project-item:opacity-100 transition-opacity shrink-0"
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
          <TooltipContent>Start loop run</TooltipContent>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover/project-item:opacity-100 transition-opacity shrink-0"
              onClick={() => handleStartRun("loop")}
              disabled={startRunMutation.isPending}
            >
              <RepeatIcon className="size-4" />
              <span className="sr-only">Start loop run</span>
            </Button>
          </TooltipTrigger>
        </Tooltip>
        <Tooltip>
          <TooltipContent>Edit project</TooltipContent>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover/project-item:opacity-100 transition-opacity shrink-0"
              onClick={() => onSave(project)}
            >
              <PencilIcon className="size-4" />
              <span className="sr-only">Edit project</span>
            </Button>
          </TooltipTrigger>
        </Tooltip>
      </ButtonGroup>
    </div>
  );
}
