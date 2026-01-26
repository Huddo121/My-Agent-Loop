import type { ProjectId, ProjectShortCode } from "@mono/api";
import { LoaderIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
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
import { ProjectDialog, type ProjectDialogMode } from "./ProjectDialog";
import { ProjectListItem } from "./ProjectListItem";

export type ProjectSidebarProps = {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (params: {
    name: string;
    shortCode: ProjectShortCode;
    repositoryUrl: string;
  }) => void;
  onUpdateProject: (params: {
    projectId: ProjectId;
    name: string;
    shortCode: ProjectShortCode;
    repositoryUrl: string;
  }) => void;
  isLoading?: boolean;
};

export const ProjectSidebar = ({
  projects,
  selectedProject,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  isLoading = false,
}: ProjectSidebarProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ProjectDialogMode>("create");
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);

  const handleOpenCreateDialog = () => {
    setDialogMode("create");
    setProjectToEdit(null);
    setDialogOpen(true);
  };

  const handleOpenRenameDialog = (project: Project) => {
    setDialogMode("rename");
    setProjectToEdit(project);
    setDialogOpen(true);
  };

  const handleDialogSubmit = (name: string, shortCode: ProjectShortCode, repositoryUrl: string) => {
    if (dialogMode === "create") {
      onCreateProject({ name, shortCode, repositoryUrl });
    } else if (projectToEdit) {
      onUpdateProject({ projectId: projectToEdit.id, name, shortCode, repositoryUrl });
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="flex-row items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Projects</h2>
        <Button variant="ghost" size="icon-sm" onClick={handleOpenCreateDialog}>
          <PlusIcon className="size-4" />
          <span className="sr-only">Create project</span>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="flex-1">
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
                  onSave={handleOpenRenameDialog}
                />
              ))
            )}
          </div>
        </ScrollArea>
        <ProjectDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={dialogMode}
          initialName={projectToEdit?.name ?? ""}
          initialShortCode={projectToEdit?.shortCode ?? ""}
          initialRepositoryUrl={projectToEdit?.repositoryUrl ?? ""}
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
