import { modules, type ModuleHref } from "@/lib/modules";

export const appRoles = ["owner", "manager", "front_desk", "accountant", "admin"] as const;

export type AppRole = (typeof appRoles)[number];
export type PermissionKey =
  | "approve_exceptions"
  | "change_rates"
  | "correct_payments"
  | "export_data"
  | "manage_staff"
  | "record_payments"
  | "view_reports";

export type AppProfile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  status: "active" | "disabled";
};

export const roleLabels: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  front_desk: "Front Desk",
  accountant: "Accountant",
  admin: "Admin",
};

const roleModuleAccess: Record<AppRole, ModuleHref[]> = {
  admin: [
    "/front-desk",
    "/members",
    "/payments",
    "/shifts",
    "/owner-review",
    "/settings",
    "/owner-dashboard",
    "/balances",
    "/exceptions",
    "/entry-reconciliation",
    "/notifications",
    "/reports",
    "/audit-logs",
  ],
  owner: [
    "/owner-review",
    "/front-desk",
    "/members",
    "/payments",
    "/shifts",
    "/settings",
    "/owner-dashboard",
    "/balances",
    "/exceptions",
    "/entry-reconciliation",
    "/notifications",
    "/reports",
    "/audit-logs",
  ],
  manager: [
    "/front-desk",
    "/members",
    "/payments",
    "/shifts",
    "/owner-review",
    "/owner-dashboard",
    "/balances",
    "/exceptions",
    "/entry-reconciliation",
    "/notifications",
    "/reports",
  ],
  front_desk: ["/front-desk", "/members", "/payments", "/shifts", "/balances", "/exceptions", "/notifications"],
  accountant: ["/payments", "/balances", "/reports", "/notifications"],
};

export function isAppRole(role: string | null | undefined): role is AppRole {
  return appRoles.includes(role as AppRole);
}

export function canAccessModule(role: AppRole, href: ModuleHref) {
  return roleModuleAccess[role].includes(href);
}

export function getAccessibleModules(role: AppRole) {
  return modules.filter((module) => canAccessModule(role, module.href));
}

export function getVisibleModules(role: AppRole) {
  return getAccessibleModules(role).filter((module) => module.visibleInSidebar);
}

export function getDefaultPathForRole(role: AppRole) {
  return roleModuleAccess[role][0] ?? "/unauthorized";
}

export function canManageSystemSettings(role: AppRole) {
  return role === "owner" || role === "admin";
}

export function hasBuiltInPermission(role: AppRole, permission: PermissionKey) {
  if (role === "owner" || role === "admin") {
    return true;
  }

  const defaults: Record<AppRole, PermissionKey[]> = {
    accountant: ["view_reports", "export_data"],
    admin: [
      "record_payments",
      "correct_payments",
      "approve_exceptions",
      "view_reports",
      "manage_staff",
      "change_rates",
      "export_data",
    ],
    front_desk: ["record_payments"],
    manager: ["record_payments", "correct_payments", "approve_exceptions", "view_reports"],
    owner: [
      "record_payments",
      "correct_payments",
      "approve_exceptions",
      "view_reports",
      "manage_staff",
      "change_rates",
      "export_data",
    ],
  };

  return defaults[role].includes(permission);
}

export function canManageMembers(role: AppRole) {
  return role === "owner" || role === "admin" || role === "manager";
}

export function canPrintMemberCards(role: AppRole) {
  return canManageMembers(role);
}
