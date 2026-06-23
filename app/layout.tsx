import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { AUTH_ENABLED } from "@/lib/auth";
import { PostHogProvider } from "@/components/posthog-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Bolt Storage — Dashboard",
  description: "Internal management dashboard for Bolt Storage",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tree = (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
        )}
      >
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );

  // Wrap in Clerk only when keys are present, so the app still runs pre-setup.
  return AUTH_ENABLED ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
