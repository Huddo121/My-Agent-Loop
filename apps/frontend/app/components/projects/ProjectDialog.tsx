import {
  type CreateProjectRequest,
  shortCodeCodec,
  type WorkflowConfigurationDto,
} from "@mono/api";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export type ProjectDialogMode = "create" | "update";

export type ProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ProjectDialogMode;
  initialName?: string;
  initialShortCode?: string;
  initialRepositoryUrl?: string;
  initialWorkflowConfiguration?: WorkflowConfigurationDto;
  onSubmit: (createProjectRequest: CreateProjectRequest) => void;
};

const defaultWorkflowConfiguration: WorkflowConfigurationDto = {
  version: "1",
  onTaskCompleted: "push-branch",
};

export function ProjectDialog({
  open,
  onOpenChange,
  mode,
  initialName = "",
  initialShortCode = "",
  initialRepositoryUrl = "",
  initialWorkflowConfiguration = defaultWorkflowConfiguration,
  onSubmit,
}: ProjectDialogProps) {
  // TODO: Switch to using react-hook-form
  const [name, setName] = useState(initialName);
  const [shortCode, setShortCode] = useState(initialShortCode);
  const [repositoryUrl, setRepositoryUrl] = useState(initialRepositoryUrl);
  const [workflowConfiguration, setWorkflowConfiguration] =
    useState<WorkflowConfigurationDto>(initialWorkflowConfiguration);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setShortCode(initialShortCode);
      setRepositoryUrl(initialRepositoryUrl);
      setWorkflowConfiguration(initialWorkflowConfiguration);
    }
  }, [
    open,
    initialName,
    initialShortCode,
    initialRepositoryUrl,
    initialWorkflowConfiguration,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && shortCode.trim() && repositoryUrl.trim()) {
      onSubmit({
        name: name.trim(),
        shortCode: shortCodeCodec.decode(shortCode.trim().toUpperCase()),
        repositoryUrl,
        workflowConfiguration,
      });
      onOpenChange(false);
    }
  };

  const title = mode === "create" ? "Create Project" : "Update Project";
  const description =
    mode === "create"
      ? "Enter a name and short code for your new project."
      : "Enter a new name and short code for this project.";
  const submitLabel = mode === "create" ? "Create" : "Update";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label
                htmlFor="project-name"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Project Name
              </label>
              <Input
                id="project-name"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="repository-url"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Repository URL
              </label>
              <Input
                id="repository-url"
                placeholder="git@github.com/something/amazing.git"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="short-code"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Short Code
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                Letters only (A-Z). Will be converted to uppercase.
              </p>
              <Input
                id="short-code"
                placeholder="ABC"
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                maxLength={10}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <label
                htmlFor="on-task-completed"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                On Task Completed
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                What action to take when a task is completed.
              </p>
              <Select
                value={workflowConfiguration.onTaskCompleted}
                onValueChange={(value: "push-branch" | "merge-immediately") =>
                  setWorkflowConfiguration({
                    ...workflowConfiguration,
                    onTaskCompleted: value,
                  })
                }
              >
                <SelectTrigger id="on-task-completed" className="mt-1 w-full">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="push-branch">Push Branch</SelectItem>
                  <SelectItem value="merge-immediately">
                    Merge Immediately
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !shortCode.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
