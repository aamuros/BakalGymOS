import Link from "next/link";

import { Card } from "@/components/ui/card";
import { getVisibleModules } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { modules, type ModuleHref } from "@/lib/modules";

type ModulePageProps = {
  href: ModuleHref;
  status?: string;
};

export async function ModulePage({ href, status = "Protected module" }: ModulePageProps) {
  const profile = await requireModuleAccess(href);
  const currentModule = modules.find((item) => item.href === href);
  const visibleModules = getVisibleModules(profile.role);

  if (!currentModule) {
    return null;
  }

  const Icon = currentModule.icon;

  return (
    <div className="page-enter space-y-6">
      <Card className="relative overflow-hidden">
        <div className="relative max-w-3xl">
          <div className="flex size-12 items-center justify-center rounded-lg bg-n-ink text-white">
            <Icon aria-hidden="true" className="size-6" />
          </div>
          <p className="mt-6 text-xs font-semibold text-n-muted">
            {status}
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-tight text-n-ink sm:text-3xl">
            {currentModule.title}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-n-dim">
            {currentModule.description}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleModules.map((item) => {
          const ItemIcon = item.icon;
          return (
            <Link href={item.href} key={item.href}>
              <Card className="h-full transition hover:bg-n-hover hover:border-n-muted/30">
                <ItemIcon aria-hidden="true" className="size-5 text-n-muted" />
                <h3 className="mt-3 text-base font-semibold text-n-ink">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-n-dim">{item.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
