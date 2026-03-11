import type { AgentConfig, AgentHarnessId } from "@mono/api";
import type { AgentHarness } from "./AgentHarness";
import type { HarnessAuthService } from "./HarnessAuthService";

type Params = {
  readonly harnessAuthService: HarnessAuthService;
  readonly harnesses: readonly AgentHarness[];
};

export function validateAgentConfig(
  agentConfig: AgentConfig | null | undefined,
  params: Params,
): string | null {
  if (agentConfig == null) {
    return null;
  }

  const harnessId: AgentHarnessId = agentConfig.harnessId;

  if (!params.harnessAuthService.isAvailable(harnessId)) {
    return `Agent harness "${harnessId}" is not available (API key not configured).`;
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
