// Public surface of the sandbox-config domain: the configuration repository and its types.
// The MCP tool is imported directly from its module by mcp.ts to keep the MCP dependency graph
// (which reaches back into Services) out of this barrel.
export {
  DatabaseSandboxTypeConfigRepository,
  type SandboxType,
  type SandboxTypeConfigRepository,
} from "./SandboxTypeConfigRepository";
