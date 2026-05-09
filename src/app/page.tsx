import { ArrowRight, Dumbbell } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-enter flex min-h-screen items-center justify-center px-4 py-10">
      <section className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="rounded-[2.5rem] border border-n-border bg-white/86 p-7 shadow-n backdrop-blur sm:p-10">
          <div className="flex size-14 items-center justify-center rounded-lg bg-n-ink text-white">
            <Dumbbell aria-hidden="true" className="size-7" />
          </div>
          <p className="mt-8 text-xs font-semibold text-n-muted">
            GymLedger
          </p>
          <h1 className="mt-4 text-2xl font-bold leading-none text-n-ink sm:text-3xl">
            Local gym operations, organized.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 font-medium text-n-dim">
            A secure staff workspace for front desk activity, collections,
            reporting, and owner oversight.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-n-ink px-6 text-sm font-bold text-white transition hover:bg-n-dark"
              href="/login"
            >
              Sign in
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {["Entries", "Payments", "Members", "Reports"].map((item) => (
            <div
              className="rounded-[2rem] border border-n-border bg-white/64 p-6 shadow-n backdrop-blur"
              key={item}
            >
              <p className="text-xs font-semibold text-n-muted">
                Placeholder
              </p>
              <h2 className="mt-8 text-xl font-bold sm:text-2xl text-n-ink">
                {item}
              </h2>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
