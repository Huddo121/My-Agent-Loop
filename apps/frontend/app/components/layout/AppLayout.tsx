import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { useDefaultLayout } from "react-resizable-panels";
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
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "app-layout",
    storage: sessionStorage,
  });

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
      const isCollapsed = sidebarPanelRef.current?.isCollapsed() ?? false;
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
    [open, setOpen, sidebarPanelRef],
  );

  // Store current values in refs so the resize handler always has fresh values
  // without needing to re-register the listener
  const openRef = useRef(open);
  const isMobileRef = useRef(isMobile);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  // Window resize listener to sync sidebar open state when crossing mobile threshold
  // When resizing to mobile, set open=false so FloatingSidebarTrigger renders
  useEffect(() => {
    const handleWindowResize = () => {
      // Skip if we're already handling a panel event to avoid circular updates
      if (isHandlingPanelEvent.current) {
        return;
      }

      const currentOpen = openRef.current;

      // When entering mobile mode, close the sidebar so FloatingSidebarTrigger appears
      if (isMobileRef.current) {
        if (currentOpen) {
          isHandlingPanelEvent.current = true;
          setOpen(false);
          requestAnimationFrame(() => {
            isHandlingPanelEvent.current = false;
          });
        }
        return;
      }

      // On desktop, sync with panel collapsed state
      const panel = sidebarPanelRef.current;
      if (!panel) {
        return;
      }

      const isCollapsed = panel.isCollapsed();

      // Sync the sidebar context with the panel's collapsed state
      if (isCollapsed && currentOpen) {
        isHandlingPanelEvent.current = true;
        setOpen(false);
        requestAnimationFrame(() => {
          isHandlingPanelEvent.current = false;
        });
      } else if (!isCollapsed && !currentOpen) {
        isHandlingPanelEvent.current = true;
        setOpen(true);
        requestAnimationFrame(() => {
          isHandlingPanelEvent.current = false;
        });
      }
    };

    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [sidebarPanelRef, setOpen]);

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
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel
        id="sidebar"
        panelRef={sidebarPanelRef}
        defaultSize={15}
        minSize="200px"
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
