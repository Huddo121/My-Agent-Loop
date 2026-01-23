import { FolderOpenIcon } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <FolderOpenIcon className="size-12 text-muted-foreground/50" />
      <h2 className="mt-4 text-lg font-medium">No project selected</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Select a project from the sidebar to view its task queue,
        <br />
        or create a new project to get started.
      </p>
    </div>
  );
}
