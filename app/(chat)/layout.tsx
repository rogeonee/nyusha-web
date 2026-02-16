import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import QueryProvider from '@/components/query-provider';
import AppSidebar from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);

  if (!user) {
    redirect('/login');
  }

  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';

  return (
    <QueryProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar user={user} />
        <SidebarInset className="min-w-0 overflow-hidden">{children}</SidebarInset>
      </SidebarProvider>
    </QueryProvider>
  );
}
