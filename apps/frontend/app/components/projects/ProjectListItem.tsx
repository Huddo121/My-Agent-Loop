import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { Project } from "~/types";

export type ProjectListItemProps = {
  project: Project;
  isSelected: boolean;
  onSelect: (project: Project) => void;
};

export function ProjectListItem({
  project,
  isSelected,
  onSelect,
}: ProjectListItemProps) {
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
            className="flex-1 min-w-0 truncate px-3 py-2 text-left justify-start text-sm font-medium"
            onClick={() => onSelect(project)}
          >
            <div className="flex gap-2 items-baseline min-w-0">
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                {project.shortCode}
              </span>
              <span className="truncate">{project.name}</span>
            </div>
          </Button>
        </TooltipTrigger>
      </Tooltip>
    </div>
  );
}
