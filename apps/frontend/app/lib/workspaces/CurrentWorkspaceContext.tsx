import { createContext, useContext } from "react";
import type { Workspace } from "~/types";

/**
 * Context that provides the current workspace when the user is "inside" the app
 * (i.e. past the setup gate). Only rendered when at least one workspace exists,
 * so workspace is always defined. Use this in app content; do not use in the
 * workspace setup flow.
 */
const CurrentWorkspaceContext = createContext<Workspace | null>(null);

export interface CurrentWorkspaceProviderProps {
  workspace: Workspace;
  children: React.ReactNode;
}

export function CurrentWorkspaceProvider({
  workspace,
  children,
}: CurrentWorkspaceProviderProps) {
  return (
    <CurrentWorkspaceContext.Provider value={workspace}>
      {children}
    </CurrentWorkspaceContext.Provider>
  );
}

/**
 * Returns the current workspace. Only call inside CurrentWorkspaceProvider
 * (i.e. after the setup gate). The workspace is always defined there.
 */
export function useCurrentWorkspace(): Workspace {
  const workspace = useContext(CurrentWorkspaceContext);
  if (workspace === null) {
    throw new Error(
      "useCurrentWorkspace must be used within CurrentWorkspaceProvider (inside the app, after workspace setup)",
    );
  }
  return workspace;
}
