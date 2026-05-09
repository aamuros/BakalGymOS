"use client";

import { Bell, Dumbbell, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoutButton } from "@/components/app/logout-button";
import { MobileBottomNav } from "@/components/app/mobile-bottom-nav";
import { getDefaultPathForRole, getVisibleModules, roleLabels, type AppProfile } from "@/lib/auth/permissions";
import { modules as allModules } from "@/lib/modules";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  notificationCount,
  profile,
}: Readonly<{
  children: React.ReactNode;
  notificationCount: number;
  profile: AppProfile;
}>) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const modules = getVisibleModules(profile.role);
  const homeHref = getDefaultPathForRole(profile.role);

  const currentModule = allModules.find(
    (module) => pathname === module.href || pathname.startsWith(`${module.href}/`),
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-n-border bg-white px-4 py-5 transition-transform lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <Link className="flex items-center gap-3" href={homeHref} onClick={() => setIsOpen(false)}>
            <span className="flex size-9 items-center justify-center rounded-lg bg-n-ink text-white">
              <Dumbbell aria-hidden="true" className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-n-ink">
                GymLedger
              </span>
            </span>
          </Link>
          <button
            aria-label="Close navigation"
            className="rounded-lg p-2 text-n-dim lg:hidden"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <nav className="mt-6 space-y-1">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = pathname === module.href || pathname.startsWith(`${module.href}/`);

            return (
              <Link
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-n-hover text-n-ink font-semibold"
                    : "text-n-dim hover:bg-n-hover hover:text-n-ink",
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

        <div className="mt-auto">
          <div className="rounded-lg border border-n-border bg-n-hover p-4">
            <p className="text-xs font-semibold text-n-muted">
              Signed in
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-n-ink">{profile.full_name}</p>
            <p className="mt-1 text-xs text-n-dim">
              {roleLabels[profile.role]}
            </p>
          </div>
          <div className="mt-3 lg:hidden">
            <LogoutButton className="w-full" />
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {isOpen ? (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-n-ink/40 lg:hidden"
          onClick={() => setIsOpen(false)}
          type="button"
        />
      ) : null}

      {/* Main content area */}
      <div className="min-w-0 pb-24 lg:pb-0">
        <header className="sticky top-0 z-20 border-b border-n-border bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <button
              aria-label="Open navigation"
              className="flex size-11 items-center justify-center rounded-lg text-n-dim transition hover:bg-n-hover active:scale-[0.96] lg:hidden"
              onClick={() => setIsOpen(true)}
              type="button"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-n-dim truncate">
                {roleLabels[profile.role]}
              </p>
              <h1 className="mt-0.5 text-lg font-semibold text-n-ink truncate sm:text-xl">
                {currentModule?.title ?? "GymLedger"}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                aria-label={`${notificationCount} unread notifications`}
                className="relative inline-flex size-11 items-center justify-center rounded-lg border border-n-border bg-white text-n-ink transition hover:bg-n-hover"
                href="/notifications"
              >
                <Bell aria-hidden="true" className="size-5" />
                {notificationCount > 0 ? (
                  <span className={cn(
                    "absolute -right-1 -top-1 flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white",
                    notificationCount > 0 && "badge-pulse",
                  )}>
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                ) : null}
              </Link>
              <span className="hidden lg:inline-flex">
                <LogoutButton />
              </span>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <MobileBottomNav profile={profile} />
    </div>
  );
}
