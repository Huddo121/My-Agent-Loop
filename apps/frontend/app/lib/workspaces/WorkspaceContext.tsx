import { createContext, useContext, useMemo } from "react";
import type { Workspace } from "~/types";
import { useWorkspacesQuery } from "./useWorkspaces";

export interface WorkspaceContextValue {
  /** Current workspace (first/only for single-workspace flow). Null while loading or when none exists. */
  currentWorkspace: Workspace | null;
  /** True while workspaces are being fetched. */
  isLoadingWorkspaces: boolean;
  /** True when loading is complete and no workspace exists (show setup). */
  needsSetup: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } =
    useWorkspacesQuery();

  const value: WorkspaceContextValue = useMemo(() => {
    const currentWorkspace = workspaces.length > 0 ? workspaces[0] : null;
    const needsSetup = !isLoadingWorkspaces && workspaces.length === 0;
    return {
      currentWorkspace,
      isLoadingWorkspaces,
      needsSetup,
    };
  }, [workspaces, isLoadingWorkspaces]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (ctx === null) {
    throw new Error(
      "useWorkspaceContext must be used within a WorkspaceProvider",
    );
  }
  return ctx;
}
