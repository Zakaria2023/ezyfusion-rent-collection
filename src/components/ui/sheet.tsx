"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A left-hand drawer built on the @base-ui/react Dialog (no new package).

type SheetContentProps = SheetPrimitive.Popup.Props & { title: string };

const Sheet = (props: SheetPrimitive.Root.Props) => (
  <SheetPrimitive.Root data-slot="sheet" {...props} />
);

const SheetTrigger = (props: SheetPrimitive.Trigger.Props) => (
  <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
);

const SheetContent = ({
  className,
  children,
  title,
  ...props
}: SheetContentProps) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
    <SheetPrimitive.Popup
      data-slot="sheet-content"
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground shadow-2xl ring-1 ring-sidebar-border transition-transform duration-200 outline-none data-ending-style:-translate-x-full data-starting-style:-translate-x-full",
        className,
      )}
      {...props}
    >
      <SheetPrimitive.Title className="sr-only">{title}</SheetPrimitive.Title>
      {children}
      <SheetPrimitive.Close
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-4 right-3"
          />
        }
      >
        <XIcon />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Popup>
  </SheetPrimitive.Portal>
);

export { Sheet, SheetContent, SheetTrigger };
