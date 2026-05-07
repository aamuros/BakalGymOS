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
  const notificationCount = await getUnreadNotificationCount(profile);

  return (
    <AppShell notificationCount={notificationCount} profile={profile}>
      {children}
    </AppShell>
  );
}
