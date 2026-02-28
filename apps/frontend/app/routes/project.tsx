import type { MoveTaskRequest, ProjectId, TaskId } from "@mono/api";
import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { AppLayout } from "~/components/layout";
import { ConnectedProjectSidebar } from "~/components/projects/ProjectSidebar";
import { EmptyState, TaskQueue } from "~/components/tasks";
import { useCreateTask, useMoveTask, useTasks } from "~/hooks";
import { useUpdateTask } from "~/hooks/useTasks";
import { ProjectsProvider, useProjectsContext } from "~/lib/projects";
import { useWorkspaceContext } from "~/lib/workspaces";
import type { NewTask, Task } from "~/types";

export function meta() {
  return [
    { title: "My Agent Loop - Projects" },
    {
      name: "description",
      content: "Manage your LLM Coding Agent task queues",
    },
  ];
}

export const ProjectPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspaceContext();
  const workspaceId = currentWorkspace?.id ?? null;
  const { projects, currentProject, isLoadingProjects } = useProjectsContext();

  // Redirect to first project if invalid project ID
  useEffect(() => {
    if (!isLoadingProjects && projects.length > 0 && !currentProject) {
      navigate(`/projects/${projects[0].id}`, { replace: true });
    }
  }, [projects, isLoadingProjects, currentProject, navigate]);

  // Fetch tasks for the selected project
  const { data: fetchedTasks = [], isLoading: isLoadingTasks } = useTasks(
    workspaceId,
    currentProject?.id ?? null,
  );

  const createTaskMutation = useCreateTask(
    workspaceId,
    currentProject?.id ?? null,
  );
  const updateTaskMutation = useUpdateTask(
    workspaceId,
    currentProject?.id ?? null,
  );
  const moveTaskMutation = useMoveTask(workspaceId, currentProject?.id ?? null);

  const handleMoveTask = useCallback(
    (taskId: TaskId, request: MoveTaskRequest, optimisticTasks: Task[]) => {
      moveTaskMutation.mutate({ taskId, request, optimisticTasks });
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
    <ProjectsProvider>
      <AppLayout sidebar={<ConnectedProjectSidebar />}>
        {currentProject ? (
          <TaskQueue
            project={currentProject}
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
    </ProjectsProvider>
  );
};

export default function ProjectRoute() {
  const { projectId } = useParams<{ projectId: ProjectId }>();

  const navigate = useNavigate();

  if (projectId === undefined) {
    navigate("/", { replace: true });
    return;
  }

  return (
    <ProjectsProvider projectId={projectId}>
      <ProjectPage />
    </ProjectsProvider>
  );
}
