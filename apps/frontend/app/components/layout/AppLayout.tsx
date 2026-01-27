import { type ReactNode, useCallback, useEffect, useRef } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
} from "~/components/ui/resizable";
import { useSidebar } from "~/components/ui/sidebar";

export type AppLayoutProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function AppLayout({ sidebar, children }: AppLayoutProps) {
  const { open, setOpen, isMobile } = useSidebar();
  const sidebarPanelRef = usePanelRef();

  // Track if we're currently handling a panel event to avoid circular updates
  const isHandlingPanelEvent = useRef(false);

  // Sync panel state with sidebar context (for Ctrl+B toggle)
  useEffect(() => {
    if (isMobile || !sidebarPanelRef.current || isHandlingPanelEvent.current) {
      return;
    }

    const panel = sidebarPanelRef.current;
    const isCollapsed = panel.isCollapsed();

    if (open && isCollapsed) {
      panel.expand();
    } else if (!open && !isCollapsed) {
      panel.collapse();
    }
  }, [open, isMobile, sidebarPanelRef]);

  // Handle panel resize to detect collapse/expand
  const handleResize = useCallback(
    (panelSize: { asPercentage: number; inPixels: number }) => {
      isHandlingPanelEvent.current = true;

      // Panel is collapsed when size is 0
      const isCollapsed = panelSize.asPercentage === 0;
      if (isCollapsed && open) {
        setOpen(false);
      } else if (!isCollapsed && !open) {
        setOpen(true);
      }

      // Reset flag after React has processed the state update
      requestAnimationFrame(() => {
        isHandlingPanelEvent.current = false;
      });
    },
    [open, setOpen],
  );

  // On mobile, don't use resizable panels - the sidebar uses a Sheet
  if (isMobile) {
    return (
      <div className="flex h-full w-full">
        {sidebar}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full w-full"
      id="app-layout"
    >
      <ResizablePanel
        id="sidebar"
        panelRef={sidebarPanelRef}
        defaultSize={20}
        minSize={'3rem'}
        maxSize={400}
        collapsible
        collapsedSize={0}
        onResize={handleResize}
      >
        {sidebar}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="main" defaultSize={80}>
        <main className="h-full w-full overflow-hidden">{children}</main>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
