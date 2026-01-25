import type { ProjectShortCode } from "@mono/api";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ProjectDialog } from "~/components/projects";
import { useCreateProject, useProjects } from "~/hooks";

export function meta() {
  return [
    { title: "My Agent Loop" },
    {
      name: "description",
      content: "Manage your LLM Coding Agent task queues",
    },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch projects from the backend
  const { data: projects = [], isLoading: isLoadingProjects } = useProjects();

  // Mutation for creating projects
  const createProjectMutation = useCreateProject();

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

  const handleCreateProject = (name: string, shortCode: ProjectShortCode) => {
    createProjectMutation.mutate(
      { name, shortCode },
      {
        onSuccess: (newProject) => {
          navigate(`/projects/${newProject.id}`, { replace: true });
        },
      },
    );
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
      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="create"
        onSubmit={handleCreateProject}
      />
    </>
  );
}
