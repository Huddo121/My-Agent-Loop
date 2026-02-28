import {
  type CreateProjectRequest,
  type ProjectId,
  shortCodeCodec,
  type UpdateProjectRequest,
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
import { useTestForgeConnectionWithCredentials } from "~/lib/projects/useProjects";
import { useWorkspaceContext } from "~/lib/workspaces";
import type { ForgeTypeDto, Project } from "~/types";

export type ProjectDialogMode = "create" | "update";

type BaseProjectDialogPropsShared = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialShortCode?: string;
  initialRepositoryUrl?: string;
  initialWorkflowConfiguration?: WorkflowConfigurationDto;
  initialForgeType?: ForgeTypeDto;
  initialForgeBaseUrl?: string;
  initialHasForgeToken?: boolean;
};

type BaseProjectDialogPropsCreate = BaseProjectDialogPropsShared & {
  mode: "create";
  initialProjectId?: never;
  onSubmit: (request: CreateProjectRequest) => void;
};

type BaseProjectDialogPropsUpdate = BaseProjectDialogPropsShared & {
  mode: "update";
  initialProjectId?: ProjectId;
  onSubmit: (request: UpdateProjectRequest) => void;
};

type BaseProjectDialogProps =
  | BaseProjectDialogPropsCreate
  | BaseProjectDialogPropsUpdate;

export type CreateProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: CreateProjectRequest) => void;
};

export type EditProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onSubmit: (request: UpdateProjectRequest) => void;
};

const defaultWorkflowConfiguration: WorkflowConfigurationDto = {
  version: "1",
  onTaskCompleted: "push-branch",
};

const defaultForgeBaseUrl = (forgeType: ForgeTypeDto) =>
  forgeType === "gitlab" ? "https://gitlab.com" : "https://github.com";

function BaseProjectDialog(props: BaseProjectDialogProps) {
  const {
    open,
    onOpenChange,
    mode,
    initialName = "",
    initialShortCode = "",
    initialRepositoryUrl = "",
    initialWorkflowConfiguration = defaultWorkflowConfiguration,
    initialForgeType,
    initialForgeBaseUrl,
    initialHasForgeToken = false,
    initialProjectId: _initialProjectId,
  } = props;
  // TODO: Switch to using react-hook-form
  const [name, setName] = useState(initialName);
  const [shortCode, setShortCode] = useState(initialShortCode);
  const [repositoryUrl, setRepositoryUrl] = useState(initialRepositoryUrl);
  const [workflowConfiguration, setWorkflowConfiguration] =
    useState<WorkflowConfigurationDto>(initialWorkflowConfiguration);
  const effectiveForgeType = initialForgeType ?? "gitlab";
  const [forgeType, setForgeType] = useState<ForgeTypeDto>(effectiveForgeType);
  const [forgeBaseUrl, setForgeBaseUrl] = useState(
    initialForgeBaseUrl ?? defaultForgeBaseUrl(effectiveForgeType),
  );
  const [forgeToken, setForgeToken] = useState("");
  const [testResult, setTestResult] = useState<
    { success: true } | { success: false; error: string } | null
  >(null);

  const { currentWorkspace } = useWorkspaceContext();
  const testForgeConnection = useTestForgeConnectionWithCredentials(
    currentWorkspace?.id ?? null,
  );

  useEffect(() => {
    if (open) {
      setName(initialName);
      setShortCode(initialShortCode);
      setRepositoryUrl(initialRepositoryUrl);
      setWorkflowConfiguration(initialWorkflowConfiguration);
      const resetForgeType = initialForgeType ?? "gitlab";
      setForgeType(resetForgeType);
      setForgeBaseUrl(
        initialForgeBaseUrl ?? defaultForgeBaseUrl(resetForgeType),
      );
      setForgeToken("");
      setTestResult(null);
    }
  }, [
    open,
    initialName,
    initialShortCode,
    initialRepositoryUrl,
    initialWorkflowConfiguration,
    initialForgeType,
    initialForgeBaseUrl,
  ]);

  const handleTestConnection = () => {
    setTestResult(null);
    testForgeConnection.mutate(
      {
        forgeType,
        forgeBaseUrl: forgeBaseUrl.trim(),
        forgeToken: forgeToken.trim(),
        repositoryUrl: repositoryUrl.trim(),
      },
      {
        onSuccess: (result) => setTestResult(result),
        onError: () =>
          setTestResult({ success: false, error: "Request failed" }),
      },
    );
  };

  const canTestConnection =
    forgeToken.trim().length > 0 && repositoryUrl.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && shortCode.trim() && repositoryUrl.trim()) {
      if (props.mode === "create") {
        props.onSubmit({
          name: name.trim(),
          shortCode: shortCodeCodec.decode(shortCode.trim().toUpperCase()),
          repositoryUrl,
          workflowConfiguration,
          forgeType,
          forgeBaseUrl: forgeBaseUrl.trim(),
          forgeToken: forgeToken.trim(),
        });
      } else {
        const update: UpdateProjectRequest = {
          name: name.trim(),
          shortCode: shortCodeCodec.decode(shortCode.trim().toUpperCase()),
          repositoryUrl,
          workflowConfiguration,
          forgeType,
          forgeBaseUrl: forgeBaseUrl.trim(),
        };
        if (forgeToken.trim()) {
          update.forgeToken = forgeToken.trim();
        }
        props.onSubmit(update);
      }
      onOpenChange(false);
    }
  };

  const canSubmit =
    name.trim() &&
    shortCode.trim() &&
    repositoryUrl.trim() &&
    (mode === "update" || forgeToken.trim());

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
            <hr />
            <h2 className="text-lg font-medium mb-1">Git Forge</h2>
            <div>
              <label
                htmlFor="forge-type"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Forge type
              </label>
              <Select
                value={forgeType}
                onValueChange={(value: ForgeTypeDto) => {
                  setForgeType(value);
                  setForgeBaseUrl(defaultForgeBaseUrl(value));
                }}
              >
                <SelectTrigger id="forge-type" className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="github">GitHub</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor="forge-base-url"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Base URL
              </label>
              <Input
                id="forge-base-url"
                placeholder="https://gitlab.com"
                value={forgeBaseUrl}
                onChange={(e) => setForgeBaseUrl(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="forge-token"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Token
              </label>
              <Input
                id="forge-token"
                type="password"
                placeholder={
                  mode === "update" && initialHasForgeToken
                    ? "Token configured"
                    : "Personal access token"
                }
                value={forgeToken}
                onChange={(e) => setForgeToken(e.target.value)}
                className="mt-1"
              />
              {canTestConnection && (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testForgeConnection.isPending}
                  >
                    {testForgeConnection.isPending
                      ? "Testing…"
                      : "Test Connection"}
                  </Button>
                  {testResult !== null &&
                    (testResult.success ? (
                      <span className="text-sm text-green-600">Success</span>
                    ) : (
                      <span className="text-sm text-destructive">
                        {testResult.error}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <hr />
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
            <hr />
            <h2 className="text-lg font-medium mb-1">Workflow Configuration</h2>
            <div>
              <label
                htmlFor="on-task-completed"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Task Completed
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                What action to take when an agent completes a task.
              </p>
              <Select
                value={workflowConfiguration.onTaskCompleted}
                onValueChange={(
                  value:
                    | "push-branch"
                    | "merge-immediately"
                    | "push-branch-and-create-mr",
                ) =>
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
                  <SelectItem value="push-branch">
                    <p>Push task branch for review</p>
                  </SelectItem>
                  <SelectItem value="push-branch-and-create-mr">
                    <p>Push branch and create merge request</p>
                  </SelectItem>
                  <SelectItem value="merge-immediately">
                    <p>Merge task branch immediately</p>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  return (
    <BaseProjectDialog
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      onSubmit={onSubmit}
    />
  );
}

export function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
}: EditProjectDialogProps) {
  return (
    <BaseProjectDialog
      open={open}
      onOpenChange={onOpenChange}
      mode="update"
      initialName={project.name}
      initialShortCode={shortCodeCodec.encode(project.shortCode)}
      initialRepositoryUrl={project.repositoryUrl}
      initialWorkflowConfiguration={project.workflowConfiguration}
      initialForgeType={project.forgeType}
      initialForgeBaseUrl={project.forgeBaseUrl}
      initialHasForgeToken={project.hasForgeToken}
      initialProjectId={project.id}
      onSubmit={onSubmit}
    />
  );
}
