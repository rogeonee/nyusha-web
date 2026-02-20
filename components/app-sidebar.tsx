'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  Sun,
  Trash2,
} from 'lucide-react';
import { logoutAction } from '@/app/(auth)/actions';
import type { Chat } from '@/lib/db/schema';
import { groupChatsByDate } from '@/lib/utils/chat-grouping';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from '@/components/ui/sidebar';
import { useEffect, useState } from 'react';

const LOADING_SKELETON_WIDTHS = ['82%', '67%', '75%', '59%'] as const;

async function fetchChats() {
  const response = await fetch('/api/history');

  if (!response.ok) {
    throw new Error('Failed to fetch chats');
  }

  return response.json() as Promise<Chat[]>;
}

async function deleteChat(chatId: string) {
  const response = await fetch(`/api/chat?id=${chatId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete chat');
  }

  return chatId;
}

export default function AppSidebar({
  user,
}: {
  user: { id: string; email: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [chatPendingDeleteId, setChatPendingDeleteId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    data: chats = [],
    isLoading,
    isError,
  } = useQuery<Chat[]>({
    queryKey: ['chats'],
    queryFn: fetchChats,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChat,
    onSuccess: (deletedChatId) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      toast.success('Чат удален.');

      if (pathname === `/chat/${deletedChatId}`) {
        router.push('/');
      }
    },
    onError: () => {
      toast.error('Не удалось удалить чат. Попробуйте снова.');
    },
  });

  const activeChatId = pathname.startsWith('/chat/')
    ? pathname.replace('/chat/', '').split('/')[0]
    : null;

  const handleOpenChat = (chatId: string) => {
    router.push(`/chat/${chatId}`);
    setOpenMobile(false);
  };

  const handleDeleteChatRequest = (chatId: string) => {
    setChatPendingDeleteId(chatId);
  };

  const handleDeleteChatConfirm = () => {
    if (!chatPendingDeleteId) {
      return;
    }

    deleteMutation.mutate(chatPendingDeleteId, {
      onSettled: () => setChatPendingDeleteId(null),
    });
  };

  const groupedChats = groupChatsByDate(chats);
  const emailInitial = user.email.charAt(0).toUpperCase();
  const effectiveTheme = mounted ? theme ?? 'system' : 'system';
  const ThemeIcon =
    effectiveTheme === 'dark'
      ? Moon
      : effectiveTheme === 'system'
      ? Monitor
      : Sun;
  const themeLabel =
    effectiveTheme === 'dark'
      ? 'Тёмная'
      : effectiveTheme === 'system'
      ? 'Системная'
      : 'Светлая';

  return (
    <Sidebar
      collapsible="icon"
      className="group-data-[side=left]:border-r-0 bg-sidebar"
    >
      {/* Content */}
      <SidebarContent>
        {/* Expanded: grouped chat list — fades on collapse */}
        <div className="transition-opacity duration-200 group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
          {isLoading ? (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {LOADING_SKELETON_WIDTHS.map((width, index) => (
                    <SidebarMenuItem key={index}>
                      <SidebarMenuSkeleton width={width} />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : isError ? (
            <p className="px-4 py-2 text-sidebar-foreground/50 text-xs">
              Не удалось загрузить чаты.
            </p>
          ) : chats.length === 0 ? (
            <p className="px-4 py-2 text-sidebar-foreground/50 text-xs">
              Нет чатов
            </p>
          ) : (
            groupedChats.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs font-medium px-2">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.chats.map((chat) => {
                      const isDeleting =
                        deleteMutation.isPending &&
                        deleteMutation.variables === chat.id;

                      return (
                        <SidebarMenuItem key={chat.id}>
                          <SidebarMenuButton
                            isActive={activeChatId === chat.id}
                            onClick={() => handleOpenChat(chat.id)}
                            className="truncate"
                          >
                            <span className="truncate">{chat.title}</span>
                          </SidebarMenuButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction
                                showOnHover
                                aria-label="Действия с чатом"
                              >
                                <MoreHorizontal className="size-4" />
                              </SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="right" align="start">
                              <DropdownMenuItem
                                disabled={isDeleting}
                                onClick={() => handleDeleteChatRequest(chat.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="size-4" />
                                <span>Удалить</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          )}
        </div>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="gap-1">
        {/* Theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Тема"
              className="flex h-10 w-full items-center gap-2 rounded-lg px-0 py-2 text-left text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center"
            >
              <span className="flex size-8 shrink-0 items-center justify-center">
                <ThemeIcon className="size-5 shrink-0" />
              </span>
              <span className="truncate text-sm transition-opacity duration-200 group-data-[collapsible=icon]:hidden">
                {themeLabel}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="size-4" />
              <span>Светлая</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="size-4" />
              <span>Тёмная</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="size-4" />
              <span>Системная</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User / Logout */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Меню аккаунта"
              className="flex h-10 w-full items-center gap-2 rounded-lg px-0 py-2 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium">
                {emailInitial}
              </span>
              <span className="truncate text-sm transition-opacity duration-200 group-data-[collapsible=icon]:hidden">
                {user.email}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem asChild>
              <form action={logoutAction} className="w-full">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2"
                >
                  <LogOut className="size-4" />
                  <span>Выйти</span>
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <AlertDialog
        open={chatPendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setChatPendingDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить чат?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChatConfirm}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Удаляем...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
