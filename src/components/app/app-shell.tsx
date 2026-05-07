"use client";

import { Dumbbell, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoutButton } from "@/components/app/logout-button";
import { getAllowedModules, getDefaultPathForRole, roleLabels, type AppProfile } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  profile,
}: Readonly<{
  children: React.ReactNode;
  profile: AppProfile;
}>) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const isStaffPinMode = profile.accessMode === "staff_pin";
  const modules = isStaffPinMode
    ? getAllowedModules(profile.role).filter((module) => module.href === "/front-desk")
    : getAllowedModules(profile.role);
  const homeHref = isStaffPinMode ? "/front-desk" : getDefaultPathForRole(profile.role);

  const currentModule = modules.find(
    (module) => pathname === module.href || pathname.startsWith(`${module.href}/`),
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[18rem_1fr]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 border-r border-ledger-line bg-ledger-ink px-4 py-5 text-ledger-paper transition-transform lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <Link className="flex items-center gap-3" href={homeHref} onClick={() => setIsOpen(false)}>
            <span className="flex size-11 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
              <Dumbbell aria-hidden="true" className="size-6" />
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-[0.28em] text-ledger-lime">
                GymLedger
              </span>
              <span className="block font-[var(--font-heading)] text-2xl font-black">
                Ops Board
              </span>
            </span>
          </Link>
          <button
            aria-label="Close navigation"
            className="rounded-full p-2 text-ledger-paper lg:hidden"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <nav className="mt-9 space-y-2">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = pathname === module.href || pathname.startsWith(`${module.href}/`);

            return (
              <Link
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-extrabold transition",
                  isActive
                    ? "bg-ledger-lime text-ledger-ink"
                    : "text-ledger-paper/76 hover:bg-white/10 hover:text-white",
                )}
                href={module.href}
                key={module.href}
                onClick={() => setIsOpen(false)}
              >
                <Icon aria-hidden="true" className="size-5" />
                {module.title}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-ledger-lime">
            Signed in
          </p>
          <p className="mt-2 truncate text-sm font-black text-white">{profile.full_name}</p>
          <p className="mt-1 text-xs font-bold text-ledger-paper/65">
            {isStaffPinMode ? "Front Desk PIN mode" : roleLabels[profile.role]}
          </p>
        </div>
      </aside>

      {isOpen ? (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-ledger-ink/55 lg:hidden"
          onClick={() => setIsOpen(false)}
          type="button"
        />
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-ledger-line bg-ledger-paper/84 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-ledger-moss">
                {roleLabels[profile.role]}
              </p>
              <h1 className="mt-1 font-[var(--font-heading)] text-2xl font-black text-ledger-ink sm:text-3xl">
                {currentModule?.title ?? "GymLedger"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <LogoutButton />
              <button
                aria-label="Open navigation"
                className="rounded-2xl border border-ledger-line bg-white/80 p-3 text-ledger-ink lg:hidden"
                onClick={() => setIsOpen(true)}
                type="button"
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
