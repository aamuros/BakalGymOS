"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function EntryReconciliationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="page-enter text-center">
      <AlertTriangle aria-hidden="true" className="mx-auto size-11 text-red-700" />
      <h2 className="mt-4 text-xl font-bold text-n-ink sm:text-2xl">
        Entry reconciliation could not load
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-6 text-red-900">
        Supabase returned an error while loading entries: {error.message}
      </p>
      <Button className="mt-6" onClick={reset} type="button">
        Try again
      </Button>
    </Card>
  );
}
