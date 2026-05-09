"use client";

import { KeyRound, UserX } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { deactivateStaff, saveStaffPin } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionState = {
  error?: string;
  message?: string;
};

function PinButton({ hasPin }: { hasPin: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button className="shrink-0 gap-2" disabled={pending} type="submit">
      <KeyRound aria-hidden="true" className="size-4" />
      {pending ? "Saving" : hasPin ? "Reset PIN" : "Set PIN"}
    </Button>
  );
}

function DeactivateButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full gap-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      disabled={pending}
      type="submit"
      variant="secondary"
    >
      <UserX aria-hidden="true" className="size-4" />
      {pending ? "Deactivating" : "Deactivate staff"}
    </Button>
  );
}

export function StaffPinControls({
  hasPin,
  isActive,
  staffProfileId,
}: {
  hasPin: boolean;
  isActive: boolean;
  staffProfileId: string;
}) {
  const [pinState, pinAction] = useActionState<ActionState, FormData>(saveStaffPin, {});
  const [deactivateState, deactivateAction] = useActionState<ActionState, FormData>(deactivateStaff, {});

  return (
    <div className="space-y-3">
      <form action={pinAction} className="space-y-3">
        <input name="staffProfileId" type="hidden" value={staffProfileId} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`pin-${staffProfileId}`}>Staff PIN</Label>
            <Input
              autoComplete="off"
              disabled={!isActive}
              id={`pin-${staffProfileId}`}
              inputMode="numeric"
              maxLength={8}
              minLength={4}
              name="pin"
              pattern="[0-9]{4,8}"
              placeholder="4 to 8 digits"
              required
              type="password"
            />
          </div>
          <PinButton hasPin={hasPin} />
        </div>
        {pinState.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {pinState.error}
          </p>
        ) : null}
        {pinState.message ? (
          <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
            {pinState.message}
          </p>
        ) : null}
      </form>

      {isActive ? (
        <form action={deactivateAction}>
          <input name="staffProfileId" type="hidden" value={staffProfileId} />
          <DeactivateButton />
          {deactivateState.error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {deactivateState.error}
            </p>
          ) : null}
          {deactivateState.message ? (
            <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
              {deactivateState.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
