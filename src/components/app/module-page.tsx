import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getAllowedModules } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { modules, type ModuleHref } from "@/lib/modules";

type ModulePageProps = {
  href: ModuleHref;
  status?: string;
};

export async function ModulePage({ href, status = "Protected module" }: ModulePageProps) {
  const profile = await requireModuleAccess(href);
  const currentModule = modules.find((item) => item.href === href);
  const allowedModules = getAllowedModules(profile.role);

  if (!currentModule) {
    return null;
  }

  const Icon = currentModule.icon;

  return (
    <div className="ledger-rise space-y-6">
      <Card className="relative overflow-hidden">
        <div className="absolute -right-16 -top-20 size-64 rounded-full bg-ledger-lime/45 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
            <Icon aria-hidden="true" className="size-7" />
          </div>
          <p className="mt-7 text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
            {status}
          </p>
          <h2 className="mt-3 font-[var(--font-heading)] text-4xl font-black leading-tight text-ledger-ink sm:text-6xl">
            {currentModule.title}
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ledger-moss">
            {currentModule.description}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {allowedModules.map((item) => {
          const ItemIcon = item.icon;
          return (
            <Link href={item.href} key={item.href}>
              <Card className="h-full shadow-none transition hover:-translate-y-1 hover:border-ledger-moss hover:bg-white">
                <ItemIcon aria-hidden="true" className="size-6 text-ledger-moss" />
                <h3 className="mt-4 font-[var(--font-heading)] text-xl font-black text-ledger-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-ledger-moss">{item.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
