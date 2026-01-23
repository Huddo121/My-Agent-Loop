import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useProjects } from "~/hooks";

export function meta() {
  return [
    { title: "My Agent Loop" },
    { name: "description", content: "Manage your LLM Coding Agent task queues" },
  ];
}

export default function Home() {
  const navigate = useNavigate();

  // Fetch projects from the backend
  const { data: projects = [], isLoading: isLoadingProjects } = useProjects();

  // Redirect to first project when projects are loaded
  useEffect(() => {
    if (!isLoadingProjects && projects.length > 0) {
      navigate(`/projects/${projects[0].id}`, { replace: true });
    }
  }, [projects, isLoadingProjects, navigate]);

  // Show loading or empty state while redirecting
  return (
    <div className="flex items-center justify-center h-screen">
      {isLoadingProjects ? (
        <div className="text-muted-foreground">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="text-muted-foreground">
          No projects found. Create your first project to get started.
        </div>
      ) : (
        <div className="text-muted-foreground">Redirecting to project...</div>
      )}
    </div>
  );
}
