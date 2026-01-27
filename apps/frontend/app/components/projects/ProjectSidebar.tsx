import type { CreateProjectRequest } from "@mono/api";
import { LoaderIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import type { Project } from "~/types";
import { Kbd } from "../ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "../ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ProjectDialog } from "./ProjectDialog";
import { ProjectListItem } from "./ProjectListItem";

export type ProjectSidebarProps = {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (createProjectRequest: CreateProjectRequest) => void;
  isLoading?: boolean;
};

export const ProjectSidebar = ({
  projects,
  selectedProject,
  onSelectProject,
  onCreateProject,
  isLoading = false,
}: ProjectSidebarProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpenCreateDialog = () => {
    setDialogOpen(true);
  };

  const handleDialogSubmit = (createProjectRequest: CreateProjectRequest) => {
    // TODO: Wait for that to complete before returning
    onCreateProject(createProjectRequest);
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="flex-row items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Projects</h2>
        <Button variant="ghost" size="icon-sm" onClick={handleOpenCreateDialog}>
          <PlusIcon className="size-4" />
          <span className="sr-only">Create project</span>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <div className="flex flex-col gap-1 p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No projects yet. Create one to get started.
            </p>
          ) : (
            projects.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                isSelected={selectedProject?.id === project.id}
                onSelect={onSelectProject}
              />
            ))
          )}
        </div>
        <ProjectDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode="create"
          onSubmit={handleDialogSubmit}
        />
      </SidebarContent>
      <SidebarFooter className="items-end border-t">
        <Tooltip>
          <TooltipContent>
            <Kbd>Ctrl+B</Kbd>
          </TooltipContent>
          <TooltipTrigger asChild>
            <SidebarTrigger />
          </TooltipTrigger>
        </Tooltip>
      </SidebarFooter>
    </Sidebar>
  );
};
