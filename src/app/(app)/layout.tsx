import { AppShell } from "@/components/app/app-shell";
import { requireCurrentProfile } from "@/lib/auth/server";
import {
  getUnreadNotificationCount,
  refreshOperationalNotifications,
} from "@/lib/notifications";

export default async function MainAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await requireCurrentProfile();
  await refreshOperationalNotifications(profile);
  const notificationCount = await getUnreadNotificationCount();

  return (
    <AppShell notificationCount={notificationCount} profile={profile}>
      {children}
    </AppShell>
  );
}
