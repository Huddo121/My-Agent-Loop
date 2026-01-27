import type { CreateProjectRequest, TaskId } from "@mono/api";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AppLayout } from "~/components/layout";
import { ProjectSidebar } from "~/components/projects";
import { EmptyState, TaskQueue } from "~/components/tasks";
import {
  useCreateProject,
  useCreateTask,
  useProjects,
  useTasks,
} from "~/hooks";
import { useUpdateTask } from "~/hooks/useTasks";
import type { NewTask, Project, Task } from "~/types";

export function meta() {
  return [
    { title: "My Agent Loop - Projects" },
    {
      name: "description",
      content: "Manage your LLM Coding Agent task queues",
    },
  ];
}

export default function ProjectRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [localTaskOrder, setLocalTaskOrder] = useState<Task[] | null>(null);

  // Fetch projects from the backend
  const { data: projects = [], isLoading: isLoadingProjects } = useProjects();

  // Find the selected project from URL params
  const selectedProject = projects.find((p) => p.id === projectId) || null;

  // Redirect to first project if invalid project ID
  useEffect(() => {
    if (!isLoadingProjects && projects.length > 0 && !selectedProject) {
      navigate(`/projects/${projects[0].id}`, { replace: true });
    }
  }, [projects, isLoadingProjects, selectedProject, navigate]);

  // Mutations for projects
  const createProjectMutation = useCreateProject();

  // Fetch tasks for the selected project
  const { data: fetchedTasks = [], isLoading: isLoadingTasks } = useTasks(
    selectedProject?.id ?? null,
  );

  // Mutation for creating tasks
  const createTaskMutation = useCreateTask(selectedProject?.id ?? null);

  // Mutation for updating tasks
  const updateTaskMutation = useUpdateTask(selectedProject?.id ?? null);

  // Use local task order if available (for drag-and-drop), otherwise use fetched tasks
  const currentTasks = localTaskOrder ?? fetchedTasks;

  // Reset local task order when selected project changes or tasks are refetched
  const handleSelectProject = useCallback(
    (project: Project) => {
      navigate(`/projects/${project.id}`);
      setLocalTaskOrder(null);
    },
    [navigate],
  );

  const handleCreateProject = useCallback(
    (createProjectRequest: CreateProjectRequest) => {
      createProjectMutation.mutate(createProjectRequest, {
        onSuccess: (newProject) => {
          navigate(`/projects/${newProject.id}`);
          setLocalTaskOrder(null);
        },
      });
    },
    [createProjectMutation, navigate],
  );

  const handleTasksReorder = useCallback((tasks: Task[]) => {
    // Store reordered tasks locally (no backend support yet)
    setLocalTaskOrder(tasks);
  }, []);

  const handleAddTask = useCallback(
    (newTask: NewTask) => {
      createTaskMutation.mutate(newTask, {
        onSuccess: () => {
          // Clear local order so we get the updated list from the server
          setLocalTaskOrder(null);
        },
      });
    },
    [createTaskMutation],
  );

  const handleUpdateTask = useCallback(
    (taskId: string, task: NewTask) => {
      updateTaskMutation.mutate(
        { taskId: taskId as TaskId, task },
        {
          onSuccess: () => {
            // Clear local order so we get the updated list from the server
            setLocalTaskOrder(null);
          },
        },
      );
    },
    [updateTaskMutation],
  );

  return (
    <AppLayout
      sidebar={
        <ProjectSidebar
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          isLoading={isLoadingProjects}
        />
      }
    >
      {selectedProject ? (
        <TaskQueue
          project={selectedProject}
          tasks={currentTasks}
          onTasksReorder={handleTasksReorder}
          onAddTask={handleAddTask}
          onUpdateTask={handleUpdateTask}
          isLoading={isLoadingTasks}
        />
      ) : (
        <EmptyState />
      )}
    </AppLayout>
  );
}
