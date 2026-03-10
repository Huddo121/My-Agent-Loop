import type { CreateProjectRequest } from "@mono/api";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CreateProjectDialog } from "~/components/projects";
import { ProjectsProvider, useProjectsContext } from "~/lib/projects";

export function meta() {
  return [
    { title: "My Agent Loop" },
    {
      name: "description",
      content: "Manage your LLM Coding Agent task queues",
    },
  ];
}

const HomePage = () => {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch projects from the backend
  const { projects, isLoadingProjects, createProject } = useProjectsContext();

  // Redirect to first project when projects are loaded
  useEffect(() => {
    if (!isLoadingProjects && projects.length > 0) {
      navigate(`/projects/${projects[0].id}`, { replace: true });
    }
  }, [projects, isLoadingProjects, navigate]);

  // Auto-open dialog when no projects exist
  useEffect(() => {
    if (!isLoadingProjects && projects.length === 0) {
      setDialogOpen(true);
    }
  }, [projects, isLoadingProjects]);

  const handleCreateProject = (request: CreateProjectRequest) => {
    createProject.mutate(request, {
      onSuccess: (newProject) => {
        navigate(`/projects/${newProject.id}`, { replace: true });
      },
    });
  };

  // Show loading or redirecting state
  return (
    <>
      <div className="flex items-center justify-center h-screen">
        {isLoadingProjects ? (
          <div className="text-muted-foreground">Loading projects...</div>
        ) : projects.length > 0 ? (
          <div className="text-muted-foreground">Redirecting to project...</div>
        ) : null}
      </div>
      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        dismissable={projects.length > 0}
        onSubmit={handleCreateProject}
      />
    </>
  );
};

export default function Home() {
  return (
    <ProjectsProvider>
      <HomePage />
    </ProjectsProvider>
  );
}
