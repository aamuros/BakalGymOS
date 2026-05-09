import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  ShieldAlert,
  UserX,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import {
  MarkAllNotificationsReadButton,
  MarkNotificationReadButton,
} from "@/app/(app)/notifications/notification-actions";
import { Card } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/server";
import { getNotifications, refreshOperationalNotifications } from "@/lib/notifications";

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const notificationMeta: Record<
  string,
  {
    icon: typeof Bell;
    tone: string;
  }
> = {
  banned_member_check_in_attempt: {
    icon: UserX,
    tone: "bg-red-50 text-red-800",
  },
  cash_variance: {
    icon: CircleDollarSign,
    tone: "bg-amber-50 text-amber-800",
  },
  exception_needs_review: {
    icon: AlertTriangle,
    tone: "bg-amber-50 text-amber-800",
  },
  gcash_proof_needs_confirmation: {
    icon: WalletCards,
    tone: "bg-sky-50 text-sky-800",
  },
  high_pending_payments: {
    icon: ShieldAlert,
    tone: "bg-red-50 text-red-800",
  },
  shift_not_closed: {
    icon: Clock3,
    tone: "bg-orange-50 text-orange-800",
  },
  unpaid_balance: {
    icon: CircleDollarSign,
    tone: "bg-amber-50 text-amber-800",
  },
};

function labelize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function NotificationsPage() {
  const profile = await requireModuleAccess("/notifications");
  await refreshOperationalNotifications(profile);

  const notifications = await getNotifications();
  const unreadCount = notifications.filter((notification) => notification.status === "unread").length;

  return (
    <div className="page-enter space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex size-14 items-center justify-center rounded-xl bg-n-ink text-white">
              <Bell aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-xs font-semibold text-n-muted">
              Alerts
            </p>
            <h2 className="mt-3 text-xl font-bold leading-tight text-n-ink sm:text-2xl">
              Notifications
            </h2>
            <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-n-dim">
              Exceptions, GCash review items, cash variance, unpaid balances, blocked entry attempts, and stale shifts appear here.
            </p>
          </div>
          {unreadCount > 0 ? <MarkAllNotificationsReadButton /> : null}
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-4 border-b border-n-border px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-n-ink">
              Recent alerts
            </h3>
            <p className="mt-1 text-sm font-medium text-n-dim">
              {unreadCount.toLocaleString("en-PH")} unread
            </p>
          </div>
        </div>

        {notifications.length ? (
          <div className="divide-y divide-n-border">
            {notifications.map((notification) => {
              const meta = notificationMeta[notification.notification_type] ?? {
                icon: Bell,
                tone: "bg-slate-100 text-slate-700",
              };
              const Icon = meta.icon;

              return (
                <div
                  className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto]"
                  key={notification.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`flex size-10 items-center justify-center rounded-xl ${meta.tone}`}>
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="break-words font-bold text-n-ink">
                            {notification.title}
                          </h4>
                          {notification.status === "unread" ? (
                            <span className="inline-flex h-6 items-center rounded-full bg-blue-50 px-2 text-[11px] font-bold uppercase text-green-800">
                              New
                            </span>
                          ) : (
                            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-green-50 px-2 text-[11px] font-bold uppercase text-green-800">
                              <CheckCircle2 aria-hidden="true" className="size-3" />
                              Read
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-n-dim">
                          {labelize(notification.notification_type)} ·{" "}
                          {dateTimeFormatter.format(new Date(notification.created_at))}
                        </p>
                      </div>
                    </div>
                    {notification.body ? (
                      <p className="mt-3 text-sm font-medium leading-6 text-n-dim">
                        {notification.body}
                      </p>
                    ) : null}
                    {notification.entity_table && notification.entity_id ? (
                      <p className="mt-2 text-xs font-semibold text-n-dim">
                        {notification.entity_table} · {notification.entity_id.slice(0, 8)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {notification.related_path ? (
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-n-ink px-4 text-xs font-bold text-white transition hover:bg-n-dark active:scale-[0.98]"
                        href={notification.related_path}
                      >
                        <ExternalLink aria-hidden="true" className="size-4" />
                        Open
                      </Link>
                    ) : null}
                    {notification.status === "unread" ? (
                      <MarkNotificationReadButton notificationId={notification.id} />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <Bell aria-hidden="true" className="mx-auto size-10 text-n-dim" />
            <p className="mt-4 font-bold text-n-ink">No notifications</p>
            <p className="mt-1 text-sm font-medium text-n-dim">
              Important operational issues will appear here.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
