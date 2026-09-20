"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useCommonChart } from "./common-context";
import { cn } from "./lib";
import { rgb } from "./palette";

export type TooltipVariant = "default" | "frosted-glass";

const VARIANT: Record<TooltipVariant, string> = {
  default: "bg-popover",
  "frosted-glass": "bg-popover/70 backdrop-blur-sm",
};

export function Tooltip({
  labelKey,
  valueFormatter,
  variant = "default",
}: {
  labelKey?: string;
  valueFormatter?: (value: number, name: string) => string;
  variant?: TooltipVariant;
}) {
  const chart = useCommonChart();
  const show = chart.ready && chart.hoverIndex != null;

  const [lastIndex, setLastIndex] = useState(0);

  if (chart.hoverIndex != null && chart.hoverIndex !== lastIndex) {
    setLastIndex(chart.hoverIndex);
  }

  const index = chart.hoverIndex ?? lastIndex;

  const heading = chart.heading(index, labelKey);
  const items = [...chart.itemsAt(index)].sort((a, b) => b.value - a.value);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const placeTooltip = useCallback(() => {
    const tooltip = tooltipRef.current;
    const parent = tooltip?.offsetParent;

    if (!tooltip || !(parent instanceof HTMLElement)) return;
    const bounds = parent.getBoundingClientRect();
    const padding = 8;
    // Intersect with the viewport so scrolling cannot hide the tooltip.
    const leftEdge = Math.max(padding, padding - bounds.left);

    const rightEdge = Math.min(
      bounds.width - padding,
      window.innerWidth - bounds.left - padding,
    );

    const topEdge = Math.max(padding, padding - bounds.top);

    const bottomEdge = Math.min(
      bounds.height - padding,
      window.innerHeight - bounds.top - padding,
    );

    tooltip.style.maxWidth = `${Math.max(1, rightEdge - leftEdge)}px`;
    tooltip.style.maxHeight = `${Math.max(1, bottomEdge - topEdge)}px`;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const above = chart.tooltipTop - height - padding;
    const preferredTop = above >= topEdge ? above : chart.tooltipTop + padding;

    const next = {
      left: Math.max(
        leftEdge,
        Math.min(chart.tooltipLeft - width / 2, rightEdge - width),
      ),
      top: Math.max(topEdge, Math.min(preferredTop, bottomEdge - height)),
    };

    tooltip.style.pointerEvents =
      tooltip.scrollHeight > tooltip.clientHeight ? "auto" : "none";
    setPosition((previous) =>
      previous?.left === next.left && previous.top === next.top
        ? previous
        : next,
    );
  }, [chart.tooltipLeft, chart.tooltipTop]);

  useLayoutEffect(() => {
    if (!show || !tooltipRef.current) return;
    placeTooltip();
    const observer = new ResizeObserver(placeTooltip);
    observer.observe(tooltipRef.current);

    if (tooltipRef.current.offsetParent instanceof HTMLElement) {
      observer.observe(tooltipRef.current.offsetParent);
    }

    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", placeTooltip, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", placeTooltip, true);
    };
  }, [show, index, heading, placeTooltip]);

  return (
    <AnimatePresence>
      {show && items.length > 0 && (
        <motion.div
          key="dither-tooltip"
          ref={tooltipRef}
          role="tooltip"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? "visible" : "hidden",
            width: "max-content",
            overflow: "auto",
          }}
          exit={{ opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 38,
            mass: 0.6,
          }}
          className={cn(
            "chart-tooltip pointer-events-none absolute z-10 rounded-lg border p-3 shadow-lg",
            VARIANT[variant],
          )}
        >
          {heading && (
            <div className="mb-2 font-mono text-[10px] leading-normal text-muted-foreground">
              {heading}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div
                key={item.name}
                className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 font-mono text-[11px] leading-normal text-popover-foreground tabular-nums"
                style={{ opacity: item.dimmed ? 0.4 : 1 }}
              >
                <span
                  className="size-2 shrink-0 rounded-[1px]"
                  style={{ backgroundColor: rgb(item.seed.fill) }}
                />
                <span className="min-w-0 break-words text-muted-foreground">
                  {item.label}
                </span>
                <span className="pl-2 text-right text-foreground">
                  {valueFormatter
                    ? valueFormatter(item.value, item.name)
                    : item.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

Tooltip.chartLayer = "dom" as const;
