import type { CreateProjectRequest, MoveTaskRequest, TaskId } from "@mono/api";
import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { AppLayout } from "~/components/layout";
import { ProjectSidebar } from "~/components/projects";
import { EmptyState, TaskQueue } from "~/components/tasks";
import {
  useCreateProject,
  useCreateTask,
  useMoveTask,
  useProjects,
  useTasks,
} from "~/hooks";
import { useUpdateTask } from "~/hooks/useTasks";
import type { NewTask, Project } from "~/types";

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

  // TODO: The fact that these have null in their type signatures is a failure
  // Mutation for creating tasks
  const createTaskMutation = useCreateTask(selectedProject?.id ?? null);

  // Mutation for updating tasks
  const updateTaskMutation = useUpdateTask(selectedProject?.id ?? null);

  // Mutation for moving tasks
  const moveTaskMutation = useMoveTask(selectedProject?.id ?? null);

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

  const handleMoveTask = useCallback(
    (taskId: TaskId, request: MoveTaskRequest) => {
      moveTaskMutation.mutate({ taskId, request });
    },
    [moveTaskMutation],
  );

  const handleAddTask = useCallback(
    (newTask: NewTask) => {
      createTaskMutation.mutate(newTask);
    },
    [createTaskMutation],
  );

  const handleUpdateTask = useCallback(
    (taskId: string, task: NewTask) => {
      updateTaskMutation.mutate({ taskId: taskId as TaskId, task });
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
          tasks={fetchedTasks}
          onMoveTask={handleMoveTask}
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
