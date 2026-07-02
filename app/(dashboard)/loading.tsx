// Shown instantly in the content area whenever you navigate to a dashboard tab, while the
// page's server-side BigQuery fetch runs — so a click always gives immediate feedback.
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border bg-muted/40" />
    </div>
  );
}
