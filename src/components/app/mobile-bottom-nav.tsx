"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { getAccessibleModules, type AppProfile } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export function MobileBottomNav({ profile }: { profile: AppProfile }) {
  const pathname = usePathname();
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  const allModules = getAccessibleModules(profile.role);
  const visibleTabs = allModules.slice(0, 4);
  const overflowTabs = allModules.slice(4);
  const showOverflow = overflowTabs.length > 0;

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:hidden">
        <div className="flex h-[4.25rem] items-center justify-around rounded-2xl border border-n-border/60 bg-white shadow-n-lg">
          {visibleTabs.map((module) => {
            const Icon = module.icon;
            const isActive =
              pathname === module.href || pathname.startsWith(`${module.href}/`);
            return (
              <Link
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 transition-all duration-200 min-w-[3.5rem] active:scale-[0.94]",
                  isActive
                    ? "bg-n-ink text-white"
                    : "text-n-dim active:bg-n-hover",
                )}
                href={module.href}
                key={module.href}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="max-w-[4.5rem] truncate text-[11px] font-semibold">
                  {module.href === "/payments" ? "Payments" : module.title}
                </span>
              </Link>
            );
          })}

          {showOverflow ? (
            <button
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 transition-all duration-200 min-w-[3.5rem] active:scale-[0.94] text-n-dim active:bg-n-hover",
                isOverflowOpen && "bg-n-hover text-n-ink",
              )}
              onClick={() => setIsOverflowOpen((prev) => !prev)}
              type="button"
            >
              <Menu aria-hidden="true" className="size-5" />
              <span className="text-[11px] font-semibold">More</span>
            </button>
          ) : null}
        </div>
      </nav>

      {isOverflowOpen ? (
        <>
          <button
            aria-label="Close menu"
            className="fixed inset-0 z-[55] bg-n-ink/30 backdrop-blur-sm backdrop-enter lg:hidden"
            onClick={() => setIsOverflowOpen(false)}
            type="button"
          />
          <div className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-n-lg sheet-enter lg:hidden">
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-n-border" />
            <div className="px-5 pt-3 pb-4">
              <p className="mb-3 text-xs font-semibold text-n-muted">
                More modules
              </p>
              <div className="grid grid-cols-3 gap-2">
                {overflowTabs.map((module) => {
                  const Icon = module.icon;
                  const isActive =
                    pathname === module.href ||
                    pathname.startsWith(`${module.href}/`);
                  return (
                    <Link
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-sm font-medium transition active:scale-[0.96]",
                        isActive
                          ? "bg-n-ink text-white"
                          : "bg-n-hover text-n-ink",
                      )}
                      href={module.href}
                      key={module.href}
                      onClick={() => setIsOverflowOpen(false)}
                    >
                      <Icon aria-hidden="true" className="size-6" />
                      <span className="text-center text-xs font-semibold leading-tight">
                        {module.href === "/payments"
                          ? "Payments"
                          : module.title}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
