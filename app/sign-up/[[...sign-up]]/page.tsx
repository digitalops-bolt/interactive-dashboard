import { SignUp } from "@clerk/nextjs";

export const runtime = "nodejs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <SignUp />
    </div>
  );
}
