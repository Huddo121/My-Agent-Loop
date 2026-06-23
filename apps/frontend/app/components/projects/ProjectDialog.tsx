import {
  type AgentConfig,
  type CreateProjectRequest,
  type ProjectId,
  shortCodeCodec,
  type UpdateProjectRequest,
  type WorkflowConfigurationDto,
  type WorkspaceId,
} from "@mono/api";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import {
  HarnessSelect,
  INHERIT_VALUE,
  parseHarnessValue,
} from "~/components/ui/HarnessSelect";
import { Input } from "~/components/ui/input";
import {
  HARNESS_DEFAULT_VALUE,
  ModelSelect,
  parseModelValue,
} from "~/components/ui/ModelSelect";
import {
  parseSandboxTypeValue,
  SANDBOX_TYPE_DEFAULT_VALUE,
  SandboxTypeSelect,
} from "~/components/ui/SandboxTypeSelect";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  useTestForgeConnectionWithCredentials,
  useTestStoredForgeConnection,
} from "~/lib/projects/useProjects";
import {
  useProjectSandboxTypeQuery,
  useSetProjectSandboxType,
} from "~/lib/sandbox/useSandboxType";
import { useCurrentWorkspace, useHarnessesQuery } from "~/lib/workspaces";
import type { ForgeTypeDto, Project } from "~/types";

export type ProjectDialogMode = "create" | "update";

type BaseProjectDialogPropsShared = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When false, dialog cannot be closed by overlay click, Escape, or Cancel. Default true. */
  dismissable?: boolean;
  initialName?: string;
  initialShortCode?: string;
  initialRepositoryUrl?: string;
  initialWorkflowConfiguration?: WorkflowConfigurationDto;
  initialForgeType?: ForgeTypeDto;
  initialForgeBaseUrl?: string;
  initialHasForgeToken?: boolean;
  /** Null means inherit from workspace (the default). */
  initialAgentConfig?: AgentConfig | null;
};

type BaseProjectDialogPropsCreate = BaseProjectDialogPropsShared & {
  mode: "create";
  initialProjectId?: never;
  onSubmit: (request: CreateProjectRequest) => Promise<void>;
};

type BaseProjectDialogPropsUpdate = BaseProjectDialogPropsShared & {
  mode: "update";
  initialProjectId?: ProjectId;
  onSubmit: (request: UpdateProjectRequest) => Promise<void>;
};

type BaseProjectDialogProps =
  | BaseProjectDialogPropsCreate
  | BaseProjectDialogPropsUpdate;

export type CreateProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When false, dialog cannot be dismissed (e.g. first project setup). Default true. */
  dismissable?: boolean;
  onSubmit: (request: CreateProjectRequest) => Promise<void>;
};

export type EditProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onSubmit: (request: UpdateProjectRequest) => Promise<void>;
};

const defaultWorkflowConfiguration: WorkflowConfigurationDto = {
  version: "1",
  onTaskCompleted: "push-branch",
};

const defaultForgeBaseUrl = (forgeType: ForgeTypeDto) =>
  forgeType === "gitlab" ? "https://gitlab.com" : "https://github.com";

function validateHttpsUrl(value: string, label: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return `${label} must use HTTPS.`;
    if (
      label === "Repository URL" &&
      url.pathname.split("/").filter(Boolean).length < 2
    ) {
      return "Repository URL must include an owner and repository path.";
    }
    return null;
  } catch {
    return `Enter a valid ${label.toLowerCase()}.`;
  }
}

function repositoryUrlPlaceholder(forgeType: ForgeTypeDto): string {
  return forgeType === "gitlab"
    ? "https://gitlab.com/group/repository.git"
    : "https://github.com/owner/repository.git";
}

type ProjectSandboxTypeSelectProps = {
  workspaceId: WorkspaceId;
  projectId: ProjectId;
};

// Separate connected component so hooks are only called when the project ID is
// known (update mode). Keeps the main dialog's hook calls unconditional.
function ProjectSandboxTypeSelect({
  workspaceId,
  projectId,
}: ProjectSandboxTypeSelectProps) {
  const { data, isLoading } = useProjectSandboxTypeQuery(
    workspaceId,
    projectId,
  );
  const setProjectSandboxType = useSetProjectSandboxType(
    workspaceId,
    projectId,
  );

  const value = data?.sandboxType ?? SANDBOX_TYPE_DEFAULT_VALUE;

  return (
    <SandboxTypeSelect
      id="project-sandbox-type"
      value={value}
      onValueChange={(next) => {
        setProjectSandboxType.mutate({
          sandboxType: parseSandboxTypeValue(next),
        });
      }}
      isLoading={isLoading}
      nullOptionLabel="Inherit from workspace"
    />
  );
}

function BaseProjectDialog(props: BaseProjectDialogProps) {
  const {
    open,
    onOpenChange,
    dismissable = true,
    mode,
    initialName = "",
    initialShortCode = "",
    initialRepositoryUrl = "",
    initialWorkflowConfiguration = defaultWorkflowConfiguration,
    initialForgeType,
    initialForgeBaseUrl,
    initialHasForgeToken = false,
    initialProjectId,
    initialAgentConfig = null,
  } = props;

  const workspace = useCurrentWorkspace();
  const { data: harnessesData, isLoading: isLoadingHarnesses } =
    useHarnessesQuery(workspace.id);
  const harnesses = harnessesData?.harnesses ?? [];

  const inheritDisplayName = useMemo(() => {
    const wsHarnessId = workspace.agentConfig?.harnessId ?? "opencode";
    return (
      harnesses.find((h) => h.id === wsHarnessId)?.displayName ?? wsHarnessId
    );
  }, [workspace.agentConfig, harnesses]);

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
  const [usesCustomForgeHost, setUsesCustomForgeHost] = useState(
    initialForgeBaseUrl !== undefined &&
      initialForgeBaseUrl !== defaultForgeBaseUrl(effectiveForgeType),
  );
  const [forgeToken, setForgeToken] = useState("");
  const [harnessValue, setHarnessValue] = useState<string>(
    initialAgentConfig?.harnessId ?? INHERIT_VALUE,
  );
  const [modelValue, setModelValue] = useState<string>(
    initialAgentConfig?.modelId ?? HARNESS_DEFAULT_VALUE,
  );
  const [testResult, setTestResult] = useState<
    { success: true } | { success: false; error: string } | null
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const testForgeConnection = useTestForgeConnectionWithCredentials();
  const testStoredForgeConnection = useTestStoredForgeConnection();

  const modelsForSelectedHarness = useMemo(() => {
    if (harnessValue === INHERIT_VALUE) return [];
    const harnessId = parseHarnessValue(harnessValue);
    if (harnessId === null) return [];
    const harness = harnesses.find((h) => h.id === harnessId);
    return harness?.models ?? [];
  }, [harnessValue, harnesses]);

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
      setUsesCustomForgeHost(
        initialForgeBaseUrl !== undefined &&
          initialForgeBaseUrl !== defaultForgeBaseUrl(resetForgeType),
      );
      setForgeToken("");
      setHarnessValue(initialAgentConfig?.harnessId ?? INHERIT_VALUE);
      setModelValue(initialAgentConfig?.modelId ?? HARNESS_DEFAULT_VALUE);
      setTestResult(null);
      setSubmitError(null);
      setIsSubmitting(false);
    }
  }, [
    open,
    initialName,
    initialShortCode,
    initialRepositoryUrl,
    initialWorkflowConfiguration,
    initialForgeType,
    initialForgeBaseUrl,
    initialAgentConfig,
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

  const handleTestStoredConnection = () => {
    if (initialProjectId === undefined) return;
    setTestResult(null);
    testStoredForgeConnection.mutate(
      {
        projectId: initialProjectId,
        forgeType,
        forgeBaseUrl: forgeBaseUrl.trim(),
        repositoryUrl: repositoryUrl.trim(),
      },
      {
        onSuccess: (result) => setTestResult(result),
        onError: (error) =>
          setTestResult({ success: false, error: error.message }),
      },
    );
  };

  const repositoryUrlError = repositoryUrl.trim()
    ? validateHttpsUrl(repositoryUrl.trim(), "Repository URL")
    : "Repository URL is required.";
  const forgeBaseUrlError = forgeBaseUrl.trim()
    ? validateHttpsUrl(forgeBaseUrl.trim(), "Hosting URL")
    : "Hosting URL is required.";
  const showRepositoryUrlError =
    repositoryUrl.length > 0 && repositoryUrlError !== null;
  const showForgeBaseUrlError =
    forgeBaseUrl.length > 0 && forgeBaseUrlError !== null;
  const canTestConnection =
    forgeToken.trim().length > 0 &&
    repositoryUrlError === null &&
    forgeBaseUrlError === null;
  const isTestingConnection =
    testForgeConnection.isPending || testStoredForgeConnection.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (
      name.trim() &&
      shortCode.trim() &&
      repositoryUrlError === null &&
      forgeBaseUrlError === null
    ) {
      const parsedHarnessId = parseHarnessValue(harnessValue);
      const agentConfig: AgentConfig | null =
        parsedHarnessId === null
          ? null
          : {
              harnessId: parsedHarnessId,
              modelId: parseModelValue(modelValue),
            };

      setIsSubmitting(true);
      try {
        if (props.mode === "create") {
          await props.onSubmit({
            name: name.trim(),
            shortCode: shortCodeCodec.decode(shortCode.trim().toUpperCase()),
            repositoryUrl: repositoryUrl.trim(),
            workflowConfiguration,
            forgeType,
            forgeBaseUrl: forgeBaseUrl.trim(),
            forgeToken: forgeToken.trim(),
            agentConfig,
          });
        } else {
          const update: UpdateProjectRequest = {
            name: name.trim(),
            shortCode: shortCodeCodec.decode(shortCode.trim().toUpperCase()),
            repositoryUrl: repositoryUrl.trim(),
            workflowConfiguration,
            forgeType,
            forgeBaseUrl: forgeBaseUrl.trim(),
            agentConfig,
          };
          if (forgeToken.trim()) {
            update.forgeToken = forgeToken.trim();
          }
          await props.onSubmit(update);
        }
        onOpenChange(false);
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : "Failed to save project.",
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const canSubmit =
    name.trim() &&
    shortCode.trim() &&
    repositoryUrlError === null &&
    forgeBaseUrlError === null &&
    (mode === "update" || forgeToken.trim()) &&
    !isSubmitting;

  const title = mode === "create" ? "Create Project" : "Update Project";
  const description =
    mode === "create"
      ? "Configure the project, repository access, and agent harness."
      : "Update the project, repository access, and agent harness.";
  const submitLabel = mode === "create" ? "Create" : "Update";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={dismissable}
        onInteractOutside={dismissable ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={dismissable ? undefined : (e) => e.preventDefault()}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="project" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="project">Project</TabsTrigger>
              <TabsTrigger value="repository">Repository</TabsTrigger>
              <TabsTrigger value="harness">Harness</TabsTrigger>
            </TabsList>
            <TabsContent value="project" className="space-y-4 py-4">
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
            </TabsContent>
            <TabsContent value="repository" className="py-4">
              <FieldGroup className="gap-5">
                <Field>
                  <FieldLabel htmlFor="forge-type">Provider</FieldLabel>
                  <FieldDescription>
                    The service hosting this Git repository.
                  </FieldDescription>
                  <Select
                    value={forgeType}
                    onValueChange={(value: ForgeTypeDto) => {
                      setForgeType(value);
                      setForgeBaseUrl(defaultForgeBaseUrl(value));
                      setUsesCustomForgeHost(false);
                      setTestResult(null);
                    }}
                  >
                    <SelectTrigger id="forge-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="gitlab">GitLab</SelectItem>
                        <SelectItem value="github">GitHub</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field data-invalid={showRepositoryUrlError}>
                  <FieldLabel htmlFor="repository-url">
                    HTTPS repository URL
                  </FieldLabel>
                  <FieldDescription>
                    Use the HTTPS clone URL. SSH URLs are not supported by MAL.
                  </FieldDescription>
                  <Input
                    id="repository-url"
                    type="url"
                    inputMode="url"
                    placeholder={repositoryUrlPlaceholder(forgeType)}
                    value={repositoryUrl}
                    onChange={(event) => {
                      setRepositoryUrl(event.target.value);
                      setTestResult(null);
                    }}
                    aria-invalid={showRepositoryUrlError}
                  />
                  {showRepositoryUrlError && (
                    <FieldError>{repositoryUrlError}</FieldError>
                  )}
                </Field>

                <Field orientation="horizontal">
                  <div>
                    <FieldLabel htmlFor="custom-forge-host">
                      Enterprise or self-hosted
                    </FieldLabel>
                    <FieldDescription>
                      Configure a hosting URL other than the public service.
                    </FieldDescription>
                  </div>
                  <Switch
                    id="custom-forge-host"
                    checked={usesCustomForgeHost}
                    onCheckedChange={(checked) => {
                      setUsesCustomForgeHost(checked);
                      if (!checked) {
                        setForgeBaseUrl(defaultForgeBaseUrl(forgeType));
                      }
                      setTestResult(null);
                    }}
                  />
                </Field>

                {usesCustomForgeHost && (
                  <Field data-invalid={showForgeBaseUrlError}>
                    <FieldLabel htmlFor="forge-base-url">
                      Hosting URL
                    </FieldLabel>
                    <FieldDescription>
                      The HTTPS web URL for your GitHub Enterprise or GitLab
                      instance.
                    </FieldDescription>
                    <Input
                      id="forge-base-url"
                      type="url"
                      inputMode="url"
                      placeholder={defaultForgeBaseUrl(forgeType)}
                      value={forgeBaseUrl}
                      onChange={(event) => {
                        setForgeBaseUrl(event.target.value);
                        setTestResult(null);
                      }}
                      aria-invalid={showForgeBaseUrlError}
                    />
                    {showForgeBaseUrlError && (
                      <FieldError>{forgeBaseUrlError}</FieldError>
                    )}
                  </Field>
                )}

                <Field>
                  <div className="flex items-center gap-2">
                    <FieldLabel htmlFor="forge-token">
                      Personal access token
                    </FieldLabel>
                    {mode === "update" && initialHasForgeToken && (
                      <Badge variant="outline">Configured</Badge>
                    )}
                  </div>
                  <FieldDescription>
                    {mode === "update" && initialHasForgeToken
                      ? "Leave blank to keep the stored token, or enter a replacement."
                      : "Provide repository read/write and API permissions required by the selected workflow."}
                  </FieldDescription>
                  <Input
                    id="forge-token"
                    type="password"
                    autoComplete="new-password"
                    placeholder={initialHasForgeToken ? "••••••••" : "Token"}
                    value={forgeToken}
                    onChange={(event) => {
                      setForgeToken(event.target.value);
                      setTestResult(null);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={
                        forgeToken.trim()
                          ? handleTestConnection
                          : handleTestStoredConnection
                      }
                      disabled={
                        isTestingConnection ||
                        (forgeToken.trim()
                          ? !canTestConnection
                          : !initialHasForgeToken ||
                            initialProjectId === undefined ||
                            repositoryUrlError !== null ||
                            forgeBaseUrlError !== null)
                      }
                    >
                      {isTestingConnection && (
                        <Spinner data-icon="inline-start" />
                      )}
                      {isTestingConnection ? "Testing…" : "Test connection"}
                    </Button>
                  </div>
                </Field>

                {testResult !== null &&
                  (testResult.success ? (
                    <Alert>
                      <CheckCircle2Icon />
                      <AlertTitle>Connection successful</AlertTitle>
                      <AlertDescription>
                        MAL can access the repository through both the forge API
                        and Git over HTTPS.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Connection failed</AlertTitle>
                      <AlertDescription>{testResult.error}</AlertDescription>
                    </Alert>
                  ))}
              </FieldGroup>
            </TabsContent>
            <TabsContent value="harness" className="space-y-4 py-4">
              <h2 className="text-lg font-medium mb-1">Agent Harness</h2>
              <div>
                <label
                  htmlFor="project-harness"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Agent harness
                </label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                  Overrides the workspace default for tasks in this project.
                </p>
                <div className="mt-1">
                  <HarnessSelect
                    id="project-harness"
                    value={harnessValue}
                    onValueChange={setHarnessValue}
                    harnesses={harnesses}
                    isLoading={isLoadingHarnesses}
                    inheritDisplayName={inheritDisplayName}
                    inheritLabel="Inherit from workspace"
                  />
                </div>
                {harnessValue !== INHERIT_VALUE && (
                  <div className="mt-4">
                    <label
                      htmlFor="project-model"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Model
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                      Used when this project&apos;s harness is selected for
                      tasks.
                    </p>
                    <div className="mt-1">
                      <ModelSelect
                        id="project-model"
                        value={modelValue}
                        onValueChange={setModelValue}
                        models={modelsForSelectedHarness}
                        isLoading={isLoadingHarnesses}
                      />
                    </div>
                  </div>
                )}
              </div>
              {initialProjectId !== undefined && (
                <div>
                  <label
                    htmlFor="project-sandbox-type"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Sandbox type
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                    Overrides the workspace sandbox type for tasks in this
                    project.
                  </p>
                  <div className="mt-1">
                    <ProjectSandboxTypeSelect
                      workspaceId={workspace.id}
                      projectId={initialProjectId}
                    />
                  </div>
                </div>
              )}
              <hr />
              <h2 className="text-lg font-medium mb-1">
                Workflow Configuration
              </h2>
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
            </TabsContent>
          </Tabs>
          {submitError !== null && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Could not save project</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="mt-4">
            {dismissable && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {isSubmitting ? "Saving…" : submitLabel}
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
  dismissable = true,
  onSubmit,
}: CreateProjectDialogProps) {
  return (
    <BaseProjectDialog
      open={open}
      onOpenChange={onOpenChange}
      dismissable={dismissable}
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
      initialAgentConfig={project.agentConfig}
      onSubmit={onSubmit}
    />
  );
}
