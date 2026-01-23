import { PencilIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { Project } from "~/types";

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
  return (
    <div
      className={cn(
        "group/project-item flex w-full items-center rounded-md transition-colors gap-1 p-1",
        isSelected
          ? "bg-sidebar-accent/50 text-sidebar-accent-foreground"
          : undefined,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        className="flex-1 truncate px-3 py-2 text-left justify-start text-sm font-medium"
        onClick={() => onSelect(project)}
      >
        <div className="flex gap-2 items-baseline">
          <span>{project.name}</span>
          <span className="text-xs text-muted-foreground font-mono">
            {project.shortCode}
          </span>
        </div>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="inset-0 opacity-0 group-hover/project-item:opacity-100 transition-opacity shrink-0"
        onClick={() => onSave(project)}
      >
        <PencilIcon className="size-4" />
        <span className="sr-only">Rename project</span>
      </Button>
    </div>
  );
}
