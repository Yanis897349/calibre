import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { triggerVariants } from "./ui/select";
import { cn } from "@/lib/utils";

const searchThreshold = 8;

function nextIndex(key: string, index: number, count: number) {
  switch (key) {
    case "ArrowDown":
      return index + 1;
    case "ArrowUp":
      return index - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "PageDown":
      return index + 8;
    case "PageUp":
      return index - 8;
    default:
      return null;
  }
}

export function MultiSelect({
  label,
  values,
  options,
  onChange,
  renderOption,
  format = (value) => value,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  renderOption?: (value: string) => ReactNode;
  format?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = useMemo(() => new Set(values), [values]);

  // Selections from shared links may name values this dataset lacks; keep them listed so they survive edits.
  const choices = useMemo(() => {
    const known = new Set(options);

    return [...options, ...values.filter((v) => !known.has(v))];
  }, [options, values]);

  const searchable = choices.length > searchThreshold;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return q
      ? choices.filter((o) => format(o).toLowerCase().includes(q))
      : choices;
  }, [choices, query, format]);

  const render = (value: string) =>
    renderOption ? renderOption(value) : format(value);

  function toggle(value: string) {
    onChange(
      selected.has(value)
        ? values.filter((v) => v !== value)
        : choices.filter((o) => o === value || selected.has(o)),
    );
  }

  function focusOption(index: number) {
    const items =
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');

    if (!items?.length) return;
    items[Math.max(0, Math.min(index, items.length - 1))].focus();
  }

  function onListKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ??
        []),
    ];

    const index = items.findIndex((item) => item === document.activeElement);
    const target = nextIndex(event.key, index, items.length);

    if (target !== null) {
      event.preventDefault();
      focusOption(target);
    }
  }

  const summary =
    values.length === 0 ? (
      <span className="multi-select-placeholder">{label}</span>
    ) : values.length === 1 ? (
      render(values[0])
    ) : (
      <>
        <span className="multi-select-first">{render(values[0])}</span>
        <span className="count-chip">+{values.length - 1}</span>
      </>
    );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) setQuery("");
      }}
    >
      <div data-slot="select-field" className="flex min-w-0 flex-col gap-1">
        <Popover.Trigger asChild>
          <button
            type="button"
            role="combobox"
            aria-label={label}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            className={cn(
              triggerVariants(),
              "select-control multi-select-control",
              values.length > 0 && "has-value",
            )}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && !open) {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span className="multi-select-summary">{summary}</span>
            <ChevronDown size={14} className="multi-select-chevron" />
          </button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          className="select-popup multi-select-popup"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const input =
                listRef.current?.parentElement?.querySelector("input");

              if (input) input.focus();
              else focusOption(0);
            });
          }}
        >
          {searchable && (
            <div className="multi-select-search">
              <Search size={13} />
              <input
                aria-label={`Search ${label.toLowerCase()}`}
                placeholder="Type to filter…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusOption(0);
                  }
                }}
              />
            </div>
          )}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            className="multi-select-list"
            onKeyDown={onListKey}
          >
            {visible.map((option) => {
              const checked = selected.has(option);

              return (
                <div
                  key={option}
                  role="option"
                  aria-selected={checked}
                  aria-label={format(option)}
                  data-value={option}
                  tabIndex={-1}
                  className={cn("multi-select-option", checked && "checked")}
                  onClick={() => toggle(option)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggle(option);
                    }
                  }}
                >
                  <span className="multi-select-box" aria-hidden>
                    {checked && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="multi-select-label">{render(option)}</span>
                </div>
              );
            })}
            {!visible.length && (
              <p className="multi-select-empty">No matches</p>
            )}
          </div>
          <div className="multi-select-footer">
            <span>
              {values.length ? `${values.length} selected` : "Any value"}
            </span>
            <button
              type="button"
              disabled={!values.length}
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
