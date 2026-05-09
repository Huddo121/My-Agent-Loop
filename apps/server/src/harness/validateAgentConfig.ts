import type { AgentConfig, AgentHarnessId, WorkspaceId } from "@mono/api";
import type { WorkspaceMembershipsService } from "../auth/WorkspaceMembershipsService";
import type { AgentHarness } from "./AgentHarness";
import type {
  HarnessAuthContext,
  HarnessAuthService,
} from "./HarnessAuthService";

type Params = {
  readonly harnessAuthService: HarnessAuthService;
  readonly harnesses: readonly AgentHarness[];
  readonly authContext: HarnessAuthContext;
};

export async function resolveWorkspaceHarnessAuthContext(
  workspaceMembershipsService: WorkspaceMembershipsService,
  workspaceId: WorkspaceId,
): Promise<HarnessAuthContext> {
  const workspaceOwnerUserId =
    await workspaceMembershipsService.getWorkspaceCreatorUserId(workspaceId);
  return workspaceOwnerUserId === undefined
    ? { kind: "no-workspace-owner" }
    : { kind: "workspace-owner", workspaceOwnerUserId };
}

export async function validateAgentConfig(
  agentConfig: AgentConfig | null | undefined,
  params: Params,
): Promise<string | null> {
  if (agentConfig == null) {
    return null;
  }

  const harnessId: AgentHarnessId = agentConfig.harnessId;
  const availability = await params.harnessAuthService.getAvailability(
    harnessId,
    params.authContext,
  );

  if (!availability.isAvailable) {
    return `Agent harness "${harnessId}" is not available (credentials not configured).`;
  }

  if (agentConfig.modelId !== null) {
    const harness = params.harnesses.find((h) => h.id === harnessId);
    const isValidModel =
      harness?.models.some((m) => m.id === agentConfig.modelId) ?? false;
    if (!isValidModel) {
      return `Model "${agentConfig.modelId}" is not available for harness "${harnessId}".`;
    }
  }

  return null;
}
