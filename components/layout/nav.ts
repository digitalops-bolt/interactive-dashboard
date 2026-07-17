import {
  ArrowLeftRight,
  GitBranch,
  Layers,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard, enabled: true },
  { label: "Portfolio Detail", href: "/portfolios", icon: Layers, enabled: true },
  { label: "Moves", href: "/moves", icon: ArrowLeftRight, enabled: true },
  { label: "Unrentable Units", href: "/unrentable", icon: Wrench, enabled: true },
  // Gated to admin + digital-ops via canSeeNav (ROUTE_RULES); hidden for viewers.
  { label: "Decision Tree", href: "/decision-tree", icon: GitBranch, enabled: true },
  { label: "Settings", href: "/settings", icon: Settings, enabled: true },
  // Visibility is gated by role via canSeeNav (admins only); hidden for everyone else.
  { label: "Admin", href: "/admin", icon: ShieldCheck, enabled: true },
];
