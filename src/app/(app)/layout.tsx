import { AppShell } from "@/components/app/app-shell";
import { requireCurrentProfile } from "@/lib/auth/server";

export default async function MainAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await requireCurrentProfile();

  return <AppShell profile={profile}>{children}</AppShell>;
}
