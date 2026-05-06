"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { checkInActiveMember } from "@/app/(app)/front-desk/actions";
import { Button } from "@/components/ui/button";

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
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {serverError}
        </div>
      ) : null}
      <Button className="w-full gap-2 sm:w-auto" disabled={isPending} onClick={onCheckIn}>
        <LogIn aria-hidden="true" className="size-4" />
        {isPending ? "Checking in..." : "Check In"}
      </Button>
    </div>
  );
}
