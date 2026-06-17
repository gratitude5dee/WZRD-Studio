import React from "react";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

// NOTE: react-resizable-panels v4 renamed PanelGroup/PanelResizeHandle → Group/Separator.
// This file provides a stable wrapper API for the rest of the WZRD app.

const ResizablePanelGroup = ({
  className,
  orientation,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    className={cn(
      "h-full w-full",
      // Group sets display:flex itself; we just ensure column layout when requested.
      orientation === "vertical" ? "flex-col" : "flex-row",
      className
    )}
    orientation={orientation}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      "relative flex items-center justify-center bg-border",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      // Vertical separator (between left/right panels)
      "aria-[orientation=vertical]:h-full aria-[orientation=vertical]:w-px",
      // Horizontal separator (between top/bottom panels)
      "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full",
      // Rotate the grip for horizontal separators
      "aria-[orientation=horizontal]:[&>div]:rotate-90",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
