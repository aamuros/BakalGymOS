"use client";

import { LogOut } from "lucide-react";

import { logout } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <button
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-n-border bg-white px-4 py-2 text-sm font-semibold text-n-ink transition hover:bg-n-hover",
          className,
        )}
        type="submit"
      >
        <LogOut aria-hidden="true" className="size-4" />
        Logout
      </button>
    </form>
  );
}
