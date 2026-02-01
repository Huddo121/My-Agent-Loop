import type { CreateProjectRequest } from "@mono/api";
import { LoaderIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { useCreateProject } from "~/lib/projects/useProjects";
import type { Project } from "~/types";
import { useProjectsContext } from "../../lib/projects";
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
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (createProjectRequest: CreateProjectRequest) => void;
  isLoading?: boolean;
};

export const ProjectSidebar = ({
  projects,
  currentProject: selectedProject,
  onSelectProject,
  onCreateProject,
  isLoading = false,
}: ProjectSidebarProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  const handleOpenCreateDialog = () => {
    setDialogOpen(true);
  };

  const handleDialogSubmit = (createProjectRequest: CreateProjectRequest) => {
    // TODO: Wait for that to complete before returning
    onCreateProject(createProjectRequest);
  };

  return (
    <Sidebar className="border-r-0" collapsible="icon">
      <SidebarHeader className="flex-row items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Projects</h2>
        <Tooltip>
          <TooltipContent>Create project</TooltipContent>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleOpenCreateDialog}
            >
              <PlusIcon className="size-4" />
              <span className="sr-only">Create project</span>
            </Button>
          </TooltipTrigger>
        </Tooltip>
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
      <SidebarFooter className="flex flex-row items-center justify-between border-t px-2 py-2">
        <Tooltip>
          <TooltipContent>Admin</TooltipContent>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate("/admin")}
            >
              <SettingsIcon className="size-4" />
              <span className="sr-only">Admin</span>
            </Button>
          </TooltipTrigger>
        </Tooltip>
        <Tooltip>
          <TooltipContent>
            <Kbd>Ctrl + B</Kbd>
          </TooltipContent>
          <TooltipTrigger asChild>
            <SidebarTrigger />
          </TooltipTrigger>
        </Tooltip>
      </SidebarFooter>
    </Sidebar>
  );
};

export const ConnectedProjectSidebar = () => {
  const navigate = useNavigate();
  // Fetch projects from the backend
  const { projects, currentProject, isLoadingProjects } = useProjectsContext();

  // Mutations for projects
  const createProjectMutation = useCreateProject();

  const handleSelectProject = useCallback(
    (project: Project) => {
      navigate(`/projects/${project.id}`);
    },
    [navigate],
  );

  const handleCreateProject = useCallback(
    (createProjectRequest: CreateProjectRequest) => {
      createProjectMutation.mutate(createProjectRequest, {
        onSuccess: (newProject) => {
          navigate(`/projects/${newProject.id}`);
        },
      });
    },
    [createProjectMutation, navigate],
  );

  return (
    <ProjectSidebar
      projects={projects}
      currentProject={currentProject}
      onSelectProject={handleSelectProject}
      onCreateProject={handleCreateProject}
      isLoading={isLoadingProjects}
    />
  );
};
