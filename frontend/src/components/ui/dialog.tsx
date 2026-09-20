"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactElement,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useIcon } from "@/lib/icon-context";
import { spring, exitFallbackMs } from "@/lib/springs";
import { useShape } from "@/lib/shape-context";
import { useSize, useSizeVariant } from "@/lib/size-context";
import { SurfaceProvider, useSurface } from "@/lib/surface-context";
import { surfaceClasses } from "@/lib/surface-classes";
import { Button } from "@/components/ui/button";

const DIALOG_OFFSET = 4;

const DialogOpenContext = createContext(false);

function Dialog({
  children,
  open: controlledOpen,
  defaultOpen,
  onOpenChange,
  ...props
}: DialogPrimitive.DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    defaultOpen ?? false,
  );

  const open = controlledOpen ?? uncontrolledOpen;

  const handleOpenChange = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <DialogOpenContext.Provider value={open}>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogOpenContext.Provider>
  );
}

interface DialogSlotProps extends Omit<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>,
  "asChild"
> {
  render?: ReactElement;
  asChild?: boolean;
}

const DialogTrigger = forwardRef<HTMLButtonElement, DialogSlotProps>(
  ({ render, asChild, children, ...props }, ref) =>
    render ? (
      <DialogPrimitive.Trigger ref={ref} asChild {...props}>
        {render}
      </DialogPrimitive.Trigger>
    ) : (
      <DialogPrimitive.Trigger ref={ref} asChild={asChild} {...props}>
        {children}
      </DialogPrimitive.Trigger>
    ),
);

DialogTrigger.displayName = "DialogTrigger";

const DialogClose = forwardRef<HTMLButtonElement, DialogSlotProps>(
  ({ render, asChild, children, ...props }, ref) =>
    render ? (
      <DialogPrimitive.Close ref={ref} asChild {...props}>
        {render}
      </DialogPrimitive.Close>
    ) : (
      <DialogPrimitive.Close ref={ref} asChild={asChild} {...props}>
        {children}
      </DialogPrimitive.Close>
    ),
);

DialogClose.displayName = "DialogClose";

interface DialogContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  size?: "sm" | "lg" | "xl";
  container?: HTMLElement | null;
  showCloseButton?: boolean;
  position?: "center" | "top";
}

const dialogWidths = {
  sm: { compact: "max-w-[360px]", default: "max-w-[400px]" },
  lg: { compact: "max-w-[480px]", default: "max-w-[540px]" },
  xl: { compact: "max-w-[800px]", default: "max-w-[880px]" },
};

const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  (
    {
      className,
      children,
      size = "sm",
      container,
      showCloseButton = true,
      position = "center",
      ...props
    },
    ref,
  ) => {
    const XIcon = useIcon("x");
    const reducedMotion = useReducedMotion();
    const open = useContext(DialogOpenContext);
    const shape = useShape();
    const substrate = useSurface();
    const dialogLevel = Math.min(substrate + DIALOG_OFFSET, 8);
    const compact = useSize().variant === "compact";
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      if (open) setMounted(true);
    }, [open]);

    // Release the overlay if background-tab throttling prevents the exit animation callback.
    useEffect(() => {
      if (open) return;

      const id = setTimeout(
        () => setMounted(false),
        exitFallbackMs(spring.slow),
      );

      return () => clearTimeout(id);
    }, [open]);

    const handleExitComplete = () => {
      if (!open) setMounted(false);
    };

    if (!mounted) return null;

    return (
      <DialogPrimitive.Portal forceMount container={container ?? undefined}>
        <DialogPrimitive.Overlay asChild forceMount>
          <motion.div
            className={cn(
              container ? "absolute" : "fixed",
              "inset-0 z-50 bg-black/40 dark:bg-black/80",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: open ? 1 : 0 }}
            transition={open ? spring.slow : spring.slow.exit}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content ref={ref} asChild forceMount {...props}>
          <motion.div
            className={cn(
              container ? "absolute" : "fixed",
              "left-1/2 z-50 flex w-[calc(100%_-_2rem)] flex-col overflow-hidden",
              position === "top"
                ? "max-h-[calc(88dvh_-_1rem)]"
                : "max-h-[calc(100dvh_-_2rem)]",
              position === "top" ? "top-[12dvh]" : "top-1/2",
              surfaceClasses(dialogLevel),
              "p-6 focus:outline-none",
              dialogWidths[size][compact ? "compact" : "default"],
              shape.container,
              className,
            )}
            initial={{
              opacity: 0,
              scale: reducedMotion ? 1 : 0.97,
              x: "-50%",
              y: position === "top" ? 0 : "-50%",
            }}
            animate={{
              opacity: open ? 1 : 0,
              scale: open || reducedMotion ? 1 : 0.97,
              x: "-50%",
              y: position === "top" ? 0 : "-50%",
            }}
            transition={dialogTransition(reducedMotion, open)}
            onAnimationComplete={handleExitComplete}
          >
            <SurfaceProvider value={dialogLevel}>
              {children}
              {showCloseButton && (
                <DialogPrimitive.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-slot="dialog-close"
                    className="absolute right-4 top-4 z-10"
                  >
                    <XIcon />
                    <span className="sr-only">Close</span>
                  </Button>
                </DialogPrimitive.Close>
              )}
            </SurfaceProvider>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);

DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex justify-end gap-2 mt-6", className)} {...props} />
  );
}

const DialogTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const compact = useSizeVariant() === "compact";

  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        compact ? "text-[15px]" : "text-[16px]",
        "text-foreground leading-tight",
        className,
      )}
      style={{ fontVariationSettings: "'wght' 700" }}
      {...props}
    />
  );
});

DialogTitle.displayName = "DialogTitle";

const DialogDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const compact = useSizeVariant() === "compact";

  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn(
        compact ? "text-[12px]" : "text-[13px]",
        "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
});

DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};

export type {
  DialogSlotProps as DialogTriggerProps,
  DialogSlotProps as DialogCloseProps,
};

function dialogTransition(reducedMotion: boolean | null, open: boolean) {
  return reducedMotion
    ? { duration: 0 }
    : open
      ? spring.slow
      : spring.slow.exit;
}
