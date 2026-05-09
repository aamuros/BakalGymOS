import { Dumbbell } from "lucide-react";

import { Card } from "@/components/ui/card";
import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <main className="page-enter flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg bg-n-ink text-white">
            <Dumbbell aria-hidden="true" className="size-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-n-muted">
              GymLedger
            </p>
            <h1 className="text-xl font-bold sm:text-2xl text-n-ink">
              Staff login
            </h1>
          </div>
        </div>

        <div className="max-w-xl">
          <Card>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-n-ink">
                Sign in with email
              </h2>
              <p className="mt-2 text-sm leading-6 text-n-dim">
                Use your GymLedger staff account to access your assigned modules.
              </p>
            </div>
            <LoginForm />
          </Card>
        </div>
      </div>
    </main>
  );
}
