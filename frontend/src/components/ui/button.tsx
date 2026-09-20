"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { IconComponent } from "@/lib/icon-context";
import { cn } from "@/lib/utils";
import { useShape } from "@/lib/shape-context";
import { useSizeVariant } from "@/lib/size-context";

const buttonVariants = cva(
  [
    "group relative isolate inline-flex items-center justify-center outline-none cursor-pointer",
    "transition-colors duration-80",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]",
  ],
  {
    variants: {
      variant: {
        primary: "text-background",
        secondary: "text-foreground",
        tertiary: "text-foreground",
        ghost: "text-muted-foreground hover:text-foreground",
      },
      size: {
        default: "h-9 px-4 text-[13px] gap-1.5",
        compact: "h-7 px-3 text-[12px] gap-1",
        icon: "h-9 w-9 p-0 [&_svg]:h-4 [&_svg]:w-4",
        "icon-compact": "h-7 w-7 p-0 [&_svg]:h-3.5 [&_svg]:w-3.5",
      },
      iconLeft: { true: "" },
      iconRight: { true: "" },
    },
    compoundVariants: [
      { size: "compact", iconLeft: true, className: "pl-2" },
      { size: "default", iconLeft: true, className: "pl-3" },
      { size: "compact", iconRight: true, className: "pr-2" },
      { size: "default", iconRight: true, className: "pr-3" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type ButtonSizeCanonical = "default" | "compact" | "icon" | "icon-compact";

type ButtonSize =
  | ButtonSizeCanonical
  | "sm"
  | "md"
  | "lg"
  | "icon-sm"
  | "icon-lg";

const legacySizeAliases: Partial<Record<ButtonSize, ButtonSizeCanonical>> = {
  sm: "compact",
  md: "default",
  lg: "default",
  "icon-sm": "icon-compact",
  "icon-lg": "icon",
};

interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, "size"> {
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  active?: boolean;
}

const bgVariants: Record<string, string> = {
  primary:
    "[--btn-bg:var(--foreground)] group-hover:[--btn-bg:color-mix(in_oklab,var(--foreground)_90%,var(--background))] group-active:[--btn-bg:color-mix(in_oklab,var(--foreground)_80%,var(--background))] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  secondary:
    "[--btn-bg:var(--accent)] group-hover:[--btn-bg:color-mix(in_oklab,var(--accent)_80%,var(--background))] group-active:[--btn-bg:var(--accent)] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  tertiary:
    "bg-transparent shadow-[0_0_0_1px_var(--border),inset_0_0_0_0px_var(--border)] group-hover:bg-hover group-active:bg-active group-active:shadow-[0_0_0_0px_var(--border),inset_0_0_0_1px_var(--border)]",
  ghost:
    "bg-transparent shadow-[0_0_0_1px_transparent] group-hover:bg-hover group-hover:shadow-[0_0_0_1px_var(--hover)] group-active:bg-active group-active:shadow-[0_0_0_0px_var(--active)]",
};

const activeBgVariants: Record<string, string> = {
  primary:
    "[--btn-bg:color-mix(in_oklab,var(--foreground)_80%,var(--background))] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  secondary:
    "[--btn-bg:var(--accent)] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  tertiary:
    "bg-active shadow-[0_0_0_1px_var(--border),inset_0_0_0_0px_var(--border)] group-active:shadow-[0_0_0_0px_var(--border),inset_0_0_0_1px_var(--border)]",
  ghost:
    "bg-active shadow-[0_0_0_1px_var(--active)] group-active:shadow-[0_0_0_0px_var(--active)]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      active = false,
      disabled,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    // Slot requires one child; clone it with the button internals to preserve icons and loading state.
    const asChildElement =
      asChild && isValidElement(children)
        ? (children as ReactElement<{ children?: ReactNode }>)
        : null;

    const Comp = asChildElement ? Slot : "button";
    const label = asChildElement ? asChildElement.props.children : children;
    const contextSize = useSizeVariant();

    const resolvedSize = resolveButtonSize(size, contextSize);

    const isIconOnly =
      resolvedSize === "icon" || resolvedSize === "icon-compact";

    const isCompact =
      resolvedSize === "compact" || resolvedSize === "icon-compact";

    const iconSize = isCompact ? 14 : 16;
    const spinnerSizeClass = isCompact ? "h-7 w-7" : "h-9 w-9";
    const shape = useShape();

    const bgClass = active
      ? activeBgVariants[variant ?? "primary"]
      : bgVariants[variant ?? "primary"];

    const internals = (
      <>
        <span
          aria-hidden
          className={cn(
            "absolute inset-px rounded-[inherit] transition-[box-shadow,background-color] [transition-duration:180ms,80ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1),ease] group-active:[transition-duration:80ms,80ms]",
            bgClass,
          )}
        />
        <span className="relative inline-flex items-center justify-center gap-[inherit]">
          <ButtonLabel
            loading={loading}
            isIconOnly={isIconOnly}
            LeadingIcon={LeadingIcon}
            TrailingIcon={TrailingIcon}
            iconSize={iconSize}
            spinnerSizeClass={spinnerSizeClass}
            label={label}
          />
        </span>
      </>
    );

    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({
            variant,
            size: resolvedSize,
            iconLeft: !isIconOnly && !!LeadingIcon,
            iconRight: !isIconOnly && !!TrailingIcon,
          }),
          shape.button,
          className,
        )}
        // Composed roots may be anchors, which do not accept disabled.
        disabled={asChildElement ? undefined : disabled || loading}
        style={style}
        {...props}
      >
        {asChildElement
          ? cloneElement(asChildElement, undefined, internals)
          : internals}
      </Comp>
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };

export type { ButtonProps, ButtonSize };

function ButtonLabel({
  loading,
  isIconOnly,
  LeadingIcon,
  TrailingIcon,
  iconSize,
  spinnerSizeClass,
  label,
}: {
  loading: boolean;
  isIconOnly: boolean;
  LeadingIcon?: IconComponent;
  TrailingIcon?: IconComponent;
  iconSize: number;
  spinnerSizeClass: string;
  label: ReactNode;
}) {
  return (
    <>
      {loading ? (
        <>
          <span className="flex items-center justify-center gap-[inherit] opacity-0">
            {LeadingIcon && !isIconOnly && (
              <LeadingIcon size={iconSize} strokeWidth={2} />
            )}
            {label}
            {TrailingIcon && !isIconOnly && (
              <TrailingIcon size={iconSize} strokeWidth={2} />
            )}
          </span>
          <span className="absolute inset-0 flex items-center justify-center">
            <svg className={spinnerSizeClass} viewBox="0 0 24 24" fill="none">
              <path
                d="M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z"
                stroke="currentColor"
                strokeWidth="1.125"
                strokeLinecap="round"
                pathLength="100"
                style={{
                  strokeDasharray: "15 85",
                  animation:
                    "spinner-move 2s linear infinite, spinner-dash 4s ease-in-out infinite",
                }}
              />
            </svg>
          </span>
        </>
      ) : isIconOnly ? (
        <span className="[&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]">
          {label}
        </span>
      ) : (
        <>
          {LeadingIcon && (
            <LeadingIcon
              size={iconSize}
              strokeWidth={1.5}
              className="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
            />
          )}
          <span className="inline-flex items-center gap-[inherit] [text-box:trim-both_cap_alphabetic]">
            {label}
          </span>
          {TrailingIcon && (
            <TrailingIcon
              size={iconSize}
              strokeWidth={1.5}
              className="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
            />
          )}
        </>
      )}
    </>
  );
}

function resolveButtonSize(
  size: ButtonSize | undefined,
  contextSize: string,
): ButtonSizeCanonical {
  return size
    ? (legacySizeAliases[size] ?? (size as ButtonSizeCanonical))
    : contextSize === "compact"
      ? "compact"
      : "default";
}
