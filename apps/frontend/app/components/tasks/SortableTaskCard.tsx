import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectId } from "@mono/api";
import type { Task } from "~/types";
import { TaskCard } from "./TaskCard";

export type SortableTaskCardProps = {
  task: Task;
  projectId: ProjectId;
  onEdit: (task: Task) => void;
};

export function SortableTaskCard({
  task,
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
    isSorting,
  } = useSortable({ id: task.id });

  const style = {
    // Only apply transform while actively sorting to prevent flash on drop
    transform: isSorting ? CSS.Transform.toString(transform) : undefined,
    transition: isSorting ? transition : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskCard
        task={task}
        projectId={projectId}
        isDragging={isDragging}
        dragHandleProps={listeners}
        onEdit={onEdit}
      />
    </div>
  );
}
