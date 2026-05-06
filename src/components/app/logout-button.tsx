"use client";

import { LogOut } from "lucide-react";

import { logout } from "@/app/actions/auth";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ledger-line bg-white/80 px-4 py-2 text-sm font-black text-ledger-ink transition hover:bg-white"
        type="submit"
      >
        <LogOut aria-hidden="true" className="size-4" />
        Logout
      </button>
    </form>
  );
}
