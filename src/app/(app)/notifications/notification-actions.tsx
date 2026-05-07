"use client";

import { Check, CheckCheck } from "lucide-react";
import { useTransition } from "react";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(app)/notifications/actions";
import { Button } from "@/components/ui/button";

export function MarkNotificationReadButton({
  notificationId,
}: Readonly<{
  notificationId: string;
}>) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className="h-10 rounded-2xl px-3 text-xs"
      disabled={isPending}
      onClick={() => startTransition(() => void markNotificationRead(notificationId))}
      type="button"
      variant="secondary"
    >
      <Check aria-hidden="true" className="size-4" />
      Mark read
    </Button>
  );
}

export function MarkAllNotificationsReadButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className="min-h-11 rounded-2xl px-4 text-xs"
      disabled={isPending}
      onClick={() => startTransition(() => void markAllNotificationsRead())}
      type="button"
      variant="secondary"
    >
      <CheckCheck aria-hidden="true" className="size-4" />
      Mark all read
    </Button>
  );
}
