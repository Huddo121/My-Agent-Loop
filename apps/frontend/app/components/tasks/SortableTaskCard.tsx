import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectId, WorkspaceId } from "@mono/api";
import type { Task } from "~/types";
import { TaskCard } from "./TaskCard";

export type SortableTaskCardProps = {
  task: Task;
  workspaceId: WorkspaceId | null;
  projectId: ProjectId;
  onEdit: (task: Task) => void;
};

export function SortableTaskCard({
  task,
  workspaceId,
  projectId,
  onEdit,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskCard
        task={task}
        workspaceId={workspaceId}
        projectId={projectId}
        isDragging={isDragging}
        dragHandleProps={listeners}
        onEdit={onEdit}
      />
    </div>
  );
}
