import { ArrowRight, Dumbbell } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="ledger-rise flex min-h-screen items-center justify-center px-4 py-10">
      <section className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="rounded-[2.5rem] border border-ledger-line bg-ledger-paper/86 p-7 shadow-ledger backdrop-blur sm:p-10">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
            <Dumbbell aria-hidden="true" className="size-7" />
          </div>
          <p className="mt-8 text-sm font-black uppercase tracking-[0.28em] text-ledger-moss">
            GymLedger
          </p>
          <h1 className="mt-4 font-[var(--font-heading)] text-5xl font-black leading-none text-ledger-ink sm:text-7xl">
            Local gym operations, organized.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ledger-moss">
            A secure staff workspace for front desk activity, collections,
            reporting, and owner oversight.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-ledger-ink px-6 text-sm font-black text-ledger-paper transition hover:bg-ledger-moss"
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
              className="rounded-[2rem] border border-ledger-line bg-white/64 p-6 shadow-ledger backdrop-blur"
              key={item}
            >
              <p className="text-sm font-black uppercase tracking-[0.2em] text-ledger-moss">
                Placeholder
              </p>
              <h2 className="mt-8 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
                {item}
              </h2>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
