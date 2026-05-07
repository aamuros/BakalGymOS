import { FileClock, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type RelatedProfile = {
  email: string | null;
  full_name: string;
};

type AuditRole = AppRole | "member";

type AuditLogRow = {
  actor_id: string | null;
  actor_role: AuditRole | null;
  action_type: string;
  created_at: string;
  entity_id: string | null;
  entity_type: string;
  id: string;
  new_data: Record<string, unknown> | null;
  note: string | null;
  old_data: Record<string, unknown> | null;
  profiles: RelatedProfile | RelatedProfile[] | null;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function relatedOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function labelize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function roleLabel(role: AuditRole | null) {
  if (!role) {
    return "System";
  }

  if (role === "member") {
    return "Member";
  }

  return roleLabels[role];
}

function compactJson(value: Record<string, unknown> | null) {
  if (!value) {
    return "None";
  }

  return JSON.stringify(value, null, 2);
}

export default async function AuditLogsPage() {
  const profile = await requireModuleAccess("/audit-logs");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id, actor_id, actor_role, action_type, entity_type, entity_id, old_data, new_data, note, created_at, profiles(full_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const logs = (data ?? []) as AuditLogRow[];
  const criticalCount = logs.filter((log) =>
    [
      "payment_corrected",
      "exception_approved",
      "exception_rejected",
      "member_banned",
      "rate_changed",
      "staff_pin_changed",
    ].includes(log.action_type),
  ).length;

  return (
    <div className="ledger-rise space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card className="relative overflow-hidden rounded-3xl">
          <div className="relative">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
              <FileClock aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
              Append-Only Audit Trail
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-4xl font-black leading-tight text-ledger-ink sm:text-6xl">
              Audit Logs
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ledger-moss">
              Owner and admin view of critical system activity, including payments,
              exceptions, shifts, member status, rates, and staff credential changes.
            </p>
          </div>
        </Card>

        <Card className="rounded-3xl shadow-none">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </div>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
            Access
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
            {roleLabels[profile.role]}
          </p>
          <p className="mt-4 text-sm font-bold leading-6 text-ledger-moss">
            Rows are protected by Supabase RLS and mutation-blocking database triggers.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl shadow-none">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
            Loaded Logs
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-5xl font-black text-ledger-ink">
            {logs.length.toLocaleString("en-PH")}
          </p>
        </Card>
        <Card className="rounded-3xl shadow-none">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
            Critical Actions
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-5xl font-black text-ledger-ink">
            {criticalCount.toLocaleString("en-PH")}
          </p>
        </Card>
        <Card className="rounded-3xl shadow-none">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
            Retention
          </p>
          <p className="mt-3 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
            Append-only
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-3xl shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-ledger-ink text-ledger-paper">
                <th className="px-4 py-3 font-black">Timestamp</th>
                <th className="px-4 py-3 font-black">User</th>
                <th className="px-4 py-3 font-black">Role</th>
                <th className="px-4 py-3 font-black">Action</th>
                <th className="px-4 py-3 font-black">Entity</th>
                <th className="px-4 py-3 font-black">Note</th>
                <th className="px-4 py-3 font-black">Old Value</th>
                <th className="px-4 py-3 font-black">New Value</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const actor = relatedOne(log.profiles);

                return (
                  <tr className="border-b border-ledger-line odd:bg-white/70" key={log.id}>
                    <td className="whitespace-nowrap px-4 py-4 font-bold text-ledger-ink">
                      {dateTimeFormatter.format(new Date(log.created_at))}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-black text-ledger-ink">
                        {actor?.full_name ?? "System"}
                      </p>
                      <p className="text-xs font-bold text-ledger-moss">
                        {actor?.email ?? log.actor_id ?? "No actor"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-bold text-ledger-moss">
                      {roleLabel(log.actor_role)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-black text-ledger-ink">
                      {labelize(log.action_type)}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-black text-ledger-ink">{labelize(log.entity_type)}</p>
                      <p className="max-w-44 truncate text-xs font-bold text-ledger-moss">
                        {log.entity_id ?? "No entity ID"}
                      </p>
                    </td>
                    <td className="max-w-56 px-4 py-4 font-bold leading-6 text-ledger-moss">
                      {log.note ?? "No note"}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <pre className="max-h-40 max-w-80 overflow-auto rounded-2xl bg-ledger-paper p-3 text-xs font-bold leading-5 text-ledger-moss">
                        {compactJson(log.old_data)}
                      </pre>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <pre className="max-h-40 max-w-80 overflow-auto rounded-2xl bg-ledger-paper p-3 text-xs font-bold leading-5 text-ledger-moss">
                        {compactJson(log.new_data)}
                      </pre>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {logs.length === 0 ? (
          <div className="border-t border-ledger-line px-4 py-10 text-center">
            <p className="font-black text-ledger-ink">No audit logs found.</p>
            <p className="mt-2 text-sm font-bold text-ledger-moss">
              New critical actions will appear here after the migration is applied.
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
