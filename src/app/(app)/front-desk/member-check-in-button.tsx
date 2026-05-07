"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { checkInActiveMember } from "@/app/(app)/front-desk/actions";
import { Button } from "@/components/ui/button";
import { StateMessage } from "@/components/ui/state-message";

type MemberCheckInButtonProps = {
  memberId: string;
};

export function MemberCheckInButton({ memberId }: MemberCheckInButtonProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onCheckIn() {
    setServerError(null);
    startTransition(async () => {
      const result = await checkInActiveMember(memberId);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {serverError ? (
        <StateMessage tone="danger" title="Check-in failed">
          {serverError}
        </StateMessage>
      ) : null}
      <Button className="min-h-14 w-full gap-2 rounded-2xl text-base sm:w-auto" disabled={isPending} onClick={onCheckIn}>
        <LogIn aria-hidden="true" className="size-4" />
        {isPending ? "Checking in..." : "Check In"}
      </Button>
    </div>
  );
}
