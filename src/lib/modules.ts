import {
  AlertTriangle,
  Bell,
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  ClipboardList,
  FileClock,
  HandCoins,
  LayoutDashboard,
  Settings,
  Users,
  UserRoundCheck,
} from "lucide-react";

export const modules = [
  {
    title: "Front Desk",
    href: "/front-desk",
    description: "Daily check-ins, walk-ins, and quick gym floor activity.",
    icon: UserRoundCheck,
  },
  {
    title: "Owner Dashboard",
    href: "/owner-dashboard",
    description: "High-level gym health, collections, and review queue.",
    icon: LayoutDashboard,
  },
  {
    title: "Members",
    href: "/members",
    description: "Active, expired, and soon-to-expire member records.",
    icon: Users,
  },
  {
    title: "Payments",
    href: "/payments",
    description: "Cash, GCash, pending balances, and payment reviews.",
    icon: BadgeDollarSign,
  },
  {
    title: "Balances",
    href: "/balances",
    description: "Unpaid utang, partial settlements, and collection tracking.",
    icon: HandCoins,
  },
  {
    title: "Entry Reconciliation",
    href: "/entry-reconciliation",
    description: "Inspect every entry and the reason access was allowed.",
    icon: ClipboardList,
  },
  {
    title: "Shifts",
    href: "/shifts",
    description: "Staff shift activity and accountability logs.",
    icon: CalendarClock,
  },
  {
    title: "Exceptions",
    href: "/exceptions",
    description: "Manual adjustments, disputes, and unusual cases.",
    icon: AlertTriangle,
  },
  {
    title: "Notifications",
    href: "/notifications",
    description: "Operational alerts that need owner or staff attention.",
    icon: Bell,
  },
  {
    title: "Reports",
    href: "/reports",
    description: "Revenue, attendance, and reconciliation summaries.",
    icon: BarChart3,
  },
  {
    title: "Audit Logs",
    href: "/audit-logs",
    description: "Append-only record of critical staff and system actions.",
    icon: FileClock,
  },
  {
    title: "Settings",
    href: "/settings",
    description: "Gym profile, roles, preferences, and system setup.",
    icon: Settings,
  },
] as const;

export type ModuleHref = (typeof modules)[number]["href"];

export function getModuleByHref(href: ModuleHref) {
  return modules.find((module) => module.href === href);
}
