import {
  AlertTriangle,
  Bell,
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  ClipboardList,
  FileClock,
  HandCoins,
  Settings,
  Users,
  UserRoundCheck,
} from "lucide-react";

export const modules = [
  {
    title: "Front Desk",
    href: "/front-desk",
    description: "Check-ins, walk-ins, QR scanning, and daily floor activity.",
    icon: UserRoundCheck,
    visibleInSidebar: true,
  },
  {
    title: "Members",
    href: "/members",
    description: "Member records, account status, subscriptions, and QR cards.",
    icon: Users,
    visibleInSidebar: true,
  },
  {
    title: "Payments & Utang",
    href: "/payments",
    description: "Record payments, review GCash, and manage unpaid balances.",
    icon: BadgeDollarSign,
    visibleInSidebar: true,
  },
  {
    title: "Shifts",
    href: "/shifts",
    description: "Open shifts, end-of-day totals, and staff activity logs.",
    icon: CalendarClock,
    visibleInSidebar: true,
  },
  {
    title: "Owner Review",
    href: "/owner-review",
    description: "Review grey-area items: cash variances, GCash issues, utang, and exceptions.",
    icon: ClipboardList,
    visibleInSidebar: true,
  },
  {
    title: "Settings",
    href: "/settings",
    description: "Gym profile, staff roles, permissions, and system setup.",
    icon: Settings,
    visibleInSidebar: true,
  },
  {
    title: "Today Summary",
    href: "/owner-dashboard",
    description: "High-level gym health, collections, and review queue.",
    icon: BarChart3,
    visibleInSidebar: false,
  },
  {
    title: "Utang",
    href: "/balances",
    description: "Unpaid utang, partial settlements, and collection tracking.",
    icon: HandCoins,
    visibleInSidebar: false,
  },
  {
    title: "Owner Review Exceptions",
    href: "/exceptions",
    description: "Manual adjustments, disputes, and unusual cases.",
    icon: AlertTriangle,
    visibleInSidebar: false,
  },
  {
    title: "Entry Inspection",
    href: "/entry-reconciliation",
    description: "Deep inspection of all gym entries and reconciliation status.",
    icon: ClipboardList,
    visibleInSidebar: false,
  },
  {
    title: "Notifications",
    href: "/notifications",
    description: "Operational alerts that need owner or staff attention.",
    icon: Bell,
    visibleInSidebar: false,
  },
  {
    title: "Reports",
    href: "/reports",
    description: "Revenue, attendance, and reconciliation summaries.",
    icon: BarChart3,
    visibleInSidebar: false,
  },
  {
    title: "Audit Logs",
    href: "/audit-logs",
    description: "Append-only record of critical staff and system actions.",
    icon: FileClock,
    visibleInSidebar: false,
  },
] as const;

export type ModuleHref = (typeof modules)[number]["href"];

export const protectedModuleHrefs = modules.map((module) => module.href) as ModuleHref[];

export function getModuleByHref(href: ModuleHref) {
  return modules.find((module) => module.href === href);
}
