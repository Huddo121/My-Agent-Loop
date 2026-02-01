import type { MoveTaskRequest, ProjectId, TaskId } from "@mono/api";
import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { AppLayout } from "~/components/layout";
import { ConnectedProjectSidebar } from "~/components/projects/ProjectSidebar";
import { EmptyState, TaskQueue } from "~/components/tasks";
import { useCreateTask, useMoveTask, useTasks } from "~/hooks";
import { useUpdateTask } from "~/hooks/useTasks";
import {
  ProjectsProvider,
  useProjectsContext,
} from "~/lib/projects";
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
  const { projects, currentProject, isLoadingProjects } = useProjectsContext();

  // Redirect to first project if invalid project ID
  useEffect(() => {
    if (!isLoadingProjects && projects.length > 0 && !currentProject) {
      navigate(`/projects/${projects[0].id}`, { replace: true });
    }
  }, [projects, isLoadingProjects, currentProject, navigate]);

  // Fetch tasks for the selected project
  const { data: fetchedTasks = [], isLoading: isLoadingTasks } = useTasks(
    currentProject?.id ?? null,
  );

  // TODO: The fact that these have null in their type signatures is a failure
  // Mutation for creating tasks
  const createTaskMutation = useCreateTask(currentProject?.id ?? null);

  // Mutation for updating tasks
  const updateTaskMutation = useUpdateTask(currentProject?.id ?? null);

  // Mutation for moving tasks
  const moveTaskMutation = useMoveTask(currentProject?.id ?? null);

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
