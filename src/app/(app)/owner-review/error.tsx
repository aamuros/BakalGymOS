"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function OwnerReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <AlertTriangle aria-hidden="true" className="size-12 text-amber-600" />
      <h2 className="text-xl font-bold text-n-ink">Something went wrong</h2>
      <p className="max-w-md text-sm font-medium text-n-dim">{error.message}</p>
      <Button onClick={reset} variant="secondary">
        Try again
      </Button>
    </div>
  );
}
