import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import QueryProvider from '@/components/query-provider';
import AppSidebar from '@/components/app-sidebar';
import ChatHeader from '@/components/chat-header';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

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
        <AppSidebar />
        <SidebarInset className="h-dvh min-h-0 overflow-hidden">
          <div className="fixed left-3 top-3 z-30 md:hidden">
            <SidebarTrigger className="border border-border/70 bg-background/90 backdrop-blur hover:bg-accent" />
          </div>
          <ChatHeader />
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </QueryProvider>
  );
}
