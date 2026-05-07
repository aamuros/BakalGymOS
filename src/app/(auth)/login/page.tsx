import { Dumbbell } from "lucide-react";

import { Card } from "@/components/ui/card";
import { LoginForm, StaffPinLoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <main className="ledger-rise flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
            <Dumbbell aria-hidden="true" className="size-6" />
          </div>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.24em] text-ledger-moss">
              GymLedger
            </p>
            <h1 className="font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
              Staff login
            </h1>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <div className="mb-6">
              <h2 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                Sign in with email
              </h2>
              <p className="mt-2 text-sm leading-6 text-ledger-moss">
                Use your GymLedger admin or owner account for full access.
              </p>
            </div>
            <LoginForm />
          </Card>

          <Card>
            <div className="mb-6">
              <h2 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                Front desk PIN
              </h2>
              <p className="mt-2 text-sm leading-6 text-ledger-moss">
                Fast staff access for front desk shift work only.
              </p>
            </div>
            <StaffPinLoginForm />
          </Card>
        </div>
      </div>
    </main>
  );
}
