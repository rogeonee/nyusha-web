'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash2, MessageSquare, PanelLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Chat } from '@/lib/db/schema';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: chats = [], isLoading } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: () => fetch('/api/history').then((r) => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (chatId: string) =>
      fetch(`/api/chat?id=${chatId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });

  const handleDelete = (chatId: string) => {
    deleteMutation.mutate(chatId);
    if (pathname === `/chat/${chatId}`) {
      router.push('/');
    }
  };

  const activeChatId = pathname.startsWith('/chat/')
    ? pathname.split('/chat/')[1]
    : null;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-3">
        <span className="text-sm font-semibold text-sidebar-foreground">
          Чаты
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => {
            router.push('/');
            setMobileOpen(false);
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded-md bg-sidebar-accent"
              />
            ))}
          </div>
        ) : chats.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Нет чатов
          </p>
        ) : (
          <div className="space-y-1">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`group flex items-center rounded-md text-sm ${
                  activeChatId === chat.id
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5"
                  onClick={() => {
                    router.push(`/chat/${chat.id}`);
                    setMobileOpen(false);
                  }}
                >
                  <MessageSquare className="size-3.5 shrink-0" />
                  <span className="truncate">{chat.title}</span>
                </button>
                <button
                  className="mr-1 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(chat.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-3 top-[1.1rem] z-50 size-8 md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <PanelLeft className="size-5" />
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border bg-sidebar-background transition-transform md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-3 size-8"
          onClick={() => setMobileOpen(false)}
        >
          <X className="size-4" />
        </Button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar-background md:block">
        {sidebarContent}
      </aside>
    </>
  );
}
