import {
  Building2,
  DollarSign,
  Layers,
  LayoutDashboard,
  Megaphone,
  TrendingUp,
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
  { label: "Operations", href: "/operations", icon: TrendingUp, enabled: false },
  { label: "Revenue", href: "/revenue", icon: DollarSign, enabled: false },
  { label: "Marketing", href: "/marketing", icon: Megaphone, enabled: false },
  { label: "Facilities", href: "/facilities", icon: Building2, enabled: false },
];
