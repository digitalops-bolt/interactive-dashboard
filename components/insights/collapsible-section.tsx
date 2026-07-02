"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

/**
 * Wraps a (server-rendered) card with a per-user hide toggle persisted in localStorage under
 * `storageKey`. Renders expanded on first paint (matching the server) until the stored
 * preference is read, to avoid a hydration mismatch. Reused by the Overview briefing and the
 * Decision Tree AI overview (distinct storageKeys keep their states independent).
 */
export function CollapsibleSection({
  title,
  storageKey,
  children,
}: {
  title: string;
  storageKey: string;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHidden(localStorage.getItem(storageKey) === "1");
    setReady(true);
  }, [storageKey]);

  const toggle = () =>
    setHidden((h) => {
      const next = !h;
      localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });

  if (ready && hidden) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-xl border bg-card px-5 py-3 text-sm font-medium shadow-sm hover:bg-muted"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {title}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          Show <ChevronDown className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        Hide <ChevronUp className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}
