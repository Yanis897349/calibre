"use client";

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type RatioSliderValue = number | [number, number];

export interface RatioSliderProps extends Omit<
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  | "value"
  | "defaultValue"
  | "onValueChange"
  | "onChange"
  | "orientation"
  | "dir"
> {
  value: RatioSliderValue;
  onChange: (value: RatioSliderValue) => void;
  label: string;
  formatValue?: (value: number) => string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const percent = (value: number) => `${Math.round(value)}%`;

export const RatioSlider = forwardRef<HTMLSpanElement, RatioSliderProps>(
  (
    {
      value,
      onChange,
      label,
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      className,
      formatValue,
      ...props
    },
    ref,
  ) => {
    const reducedMotion = useReducedMotion();
    const isRange = Array.isArray(value);
    const values = sliderValues(value, min, max);
    const span = max - min;
    const position = (v: number) => (span > 0 ? ((v - min) / span) * 100 : 0);
    const low = isRange ? position(values[0]) : 0;
    const high = position(values[isRange ? 1 : 0]);
    const display = formatValue ?? ((v: number) => percent(position(v)));
    const leftText = display(values[0]);
    const rightText = isRange ? display(values[1]) : percent(100 - high);
    const rangeText = `${leftText} – ${rightText}`;
    const [dragging, setDragging] = useState(false);
    const [compact, setCompact] = useState(false);
    const trackRef = useRef<HTMLSpanElement>(null);
    const leftLabelRef = useRef<HTMLSpanElement>(null);
    const rightLabelRef = useRef<HTMLSpanElement>(null);
    const rangeLabelRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
      const track = trackRef.current;

      if (!track) return;

      const measure = () => {
        const width = track.clientWidth;

        const fits = isRange
          ? ((high - low) / 100) * width - 16 >=
            (rangeLabelRef.current?.offsetWidth ?? 0) + 16
          : (high / 100) * width - 8 >=
              (leftLabelRef.current?.offsetWidth ?? 0) + 16 &&
            ((100 - high) / 100) * width - 8 >=
              (rightLabelRef.current?.offsetWidth ?? 0) + 16;

        setCompact(!fits);
      };

      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(track);

      return () => observer.disconnect();
    }, [isRange, low, high, leftText, rightText]);

    const transition = { duration: reducedMotion || dragging ? 0 : 0.14 };

    return (
      <SliderPrimitive.Root
        {...props}
        ref={ref}
        className={cn("ratio-slider", className)}
        value={values}
        min={min}
        max={max}
        step={step}
        disabled={disabled || span <= 0}
        orientation="horizontal"
        dir="ltr"
        data-compact={compact || undefined}
        data-dragging={dragging || undefined}
        data-range={isRange || undefined}
        onPointerDownCapture={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
        onValueChange={(next) => {
          const rounded = next.map((v) => Number(v.toFixed(10)));
          onChange(isRange ? [rounded[0], rounded[1]] : rounded[0]);
        }}
      >
        <SliderPrimitive.Track ref={trackRef} className="ratio-slider-track">
          {isRange && (
            <motion.span
              className="ratio-slider-bar ratio-slider-muted"
              initial={false}
              animate={{ left: 0, width: `max(0px, calc(${low}% - 8px))` }}
              transition={transition}
            />
          )}
          <motion.span
            className="ratio-slider-bar ratio-slider-fill"
            initial={false}
            animate={{
              left: isRange ? `calc(${low}% + 8px)` : 0,
              width: `max(0px, calc(${high - low}% - ${isRange ? 16 : 8}px))`,
            }}
            transition={transition}
          />
          <motion.span
            className="ratio-slider-bar ratio-slider-muted"
            initial={false}
            animate={{
              left: `calc(${high}% + 8px)`,
              width: `max(0px, calc(${100 - high}% - 8px))`,
            }}
            transition={transition}
          />
          {/* Keep labels mounted so their widths can be measured. */}
          {isRange ? (
            <span
              ref={rangeLabelRef}
              className="ratio-slider-label ratio-slider-range-label"
              aria-hidden="true"
              style={{ left: compact ? "50%" : `${(low + high) / 2}%` }}
            >
              {rangeText}
            </span>
          ) : (
            <>
              <span
                ref={leftLabelRef}
                className="ratio-slider-label ratio-slider-left-label"
                aria-hidden="true"
              >
                {leftText}
              </span>
              <span
                ref={rightLabelRef}
                className="ratio-slider-label ratio-slider-right-label"
                aria-hidden="true"
              >
                {rightText}
              </span>
            </>
          )}
        </SliderPrimitive.Track>
        {values.map((v, index) => (
          <SliderPrimitive.Thumb
            key={index}
            className="ratio-slider-thumb"
            aria-label={
              isRange
                ? `${label} ${index === 0 ? "minimum" : "maximum"}`
                : label
            }
            aria-valuetext={display(v)}
          />
        ))}
      </SliderPrimitive.Root>
    );
  },
);

RatioSlider.displayName = "RatioSlider";

function sliderValues(value: RatioSliderValue, min: number, max: number) {
  const isRange = Array.isArray(value);
  const values = (isRange ? value : [value]).map((v) => clamp(v, min, max));

  if (isRange) values.sort((a, b) => a - b);

  return values;
}
