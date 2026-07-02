"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { CalendarDays, ChevronDown, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import {
  DATA_FLOOR,
  RANGE_OPTIONS,
  maxSelectableDate,
  rangeLabel,
  type RangeSpec,
} from "@/lib/metrics";

const toISO = (d: Date) => format(d, "yyyy-MM-dd");

export function RangeFilter({ active }: { active: RangeSpec }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const floorDate = parseISO(DATA_FLOOR);
  const maxDate = parseISO(maxSelectableDate());

  const [range, setRange] = useState<DateRange | undefined>(
    active.kind === "custom"
      ? { from: parseISO(active.from), to: parseISO(active.to) }
      : undefined,
  );

  // Close when clicking outside the control.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pushParams(mut: (sp: URLSearchParams) => void) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    mut(sp);
    setOpen(false);
    // Transition so `pending` stays true while the server re-renders (shows the spinner).
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  }

  function applyPreset(key: string) {
    track("range_changed", { kind: "preset", key });
    pushParams((sp) => {
      sp.set("range", key);
      sp.delete("from");
      sp.delete("to");
    });
  }

  function applyCustom() {
    if (!range?.from || !range?.to) return;
    track("range_changed", {
      kind: "custom",
      from: toISO(range.from),
      to: toISO(range.to),
    });
    pushParams((sp) => {
      sp.set("range", "custom");
      sp.set("from", toISO(range.from!));
      sp.set("to", toISO(range.to!));
    });
  }

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-busy={pending}
        className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        )}
        {pending ? "Loading…" : rangeLabel(active)}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 flex flex-col overflow-hidden rounded-lg border bg-background shadow-lg sm:flex-row">
          <div className="flex min-w-[150px] flex-col gap-0.5 border-b p-1.5 sm:border-b-0 sm:border-r">
            {RANGE_OPTIONS.map((o) => {
              const isActive = active.kind === "preset" && active.key === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => applyPreset(o.key)}
                  className={cn(
                    "rounded px-3 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          <div
            className="p-2"
            style={
              {
                "--rdp-accent-color": "hsl(var(--primary))",
                "--rdp-background-color": "hsl(var(--muted))",
                "--rdp-cell-size": "36px",
              } as React.CSSProperties
            }
          >
            <p className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Custom range
            </p>
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              defaultMonth={range?.to ?? maxDate}
              fromDate={floorDate}
              toDate={maxDate}
              disabled={[{ before: floorDate }, { after: maxDate }]}
              showOutsideDays
            />
            <div className="flex items-center justify-between gap-3 px-1 pt-1">
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {range?.from ? toISO(range.from) : "start"} →{" "}
                {range?.to ? toISO(range.to) : "end"}
              </span>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!range?.from || !range?.to}
                className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
