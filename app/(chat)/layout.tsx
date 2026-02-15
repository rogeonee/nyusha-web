import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import QueryProvider from '@/components/query-provider';
import Sidebar from '@/components/sidebar';

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <QueryProvider>
      <div className="flex h-[calc(100vh-theme(spacing.16))] overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </QueryProvider>
  );
}
