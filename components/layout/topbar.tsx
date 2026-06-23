export function Topbar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="font-semibold md:hidden">Bolt Storage</div>
      <div className="hidden text-sm text-muted-foreground md:block">
        Management Dashboard
      </div>
      <div className="flex items-center gap-2 text-sm">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          F
        </div>
      </div>
    </header>
  );
}
