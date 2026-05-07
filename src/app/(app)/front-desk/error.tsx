"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function FrontDeskError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="ledger-rise rounded-3xl border-red-200 bg-red-50 text-center shadow-none">
      <AlertTriangle aria-hidden="true" className="mx-auto size-12 text-red-700" />
      <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
        Front desk could not load
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-base font-bold leading-7 text-red-900">
        The counter screen needs live member, shift, and payment data. Error: {error.message}
      </p>
      <Button className="mt-6 min-h-14 rounded-2xl text-base" onClick={reset} type="button">
        Try again
      </Button>
    </Card>
  );
}
