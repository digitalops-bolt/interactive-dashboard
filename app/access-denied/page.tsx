import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Access pending</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your account isn&apos;t authorized for the Bolt Storage dashboard yet. Please sign in
        with your <span className="font-medium">@boltstorage.com</span> Google account, or ask
        an admin to grant you access.
      </p>
      <Link
        href="/sign-in"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Back to sign in
      </Link>
    </div>
  );
}
