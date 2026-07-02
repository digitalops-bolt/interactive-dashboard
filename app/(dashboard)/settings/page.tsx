import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AUTH_ENABLED } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import {
  COMPARE_OPTIONS,
  FOCUS_OPTIONS,
  getBriefingPrefs,
} from "@/lib/briefing-prefs";
import { saveBriefingPrefs } from "./actions";

export const runtime = "nodejs";

export default async function SettingsPage() {
  if (!AUTH_ENABLED) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Sign-in isn&apos;t configured in this environment, so per-user preferences are
            unavailable. The briefing uses default settings.
          </CardContent>
        </Card>
      </div>
    );
  }

  const me = await getCurrentUser();
  const prefs = getBriefingPrefs(me);
  const focus = new Set(prefs.focus);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Tailor your management briefing. These only change what you see — everyone shares the
          same underlying analysis.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Briefing preferences</CardTitle>
          <CardDescription>
            Choose which signals to surface and how to compare the headline numbers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveBriefingPrefs} className="space-y-6">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Focus areas</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {FOCUS_OPTIONS.map((o) => (
                  <label
                    key={o.key}
                    className="flex items-center gap-2 rounded-md border p-2.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="focus"
                      value={o.key}
                      defaultChecked={focus.has(o.key)}
                      className="h-4 w-4"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Comparison</legend>
              <div className="flex flex-col gap-2">
                {COMPARE_OPTIONS.map((o) => (
                  <label key={o.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="compare"
                      value={o.key}
                      defaultChecked={prefs.compare === o.key}
                      className="h-4 w-4"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Save preferences
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
