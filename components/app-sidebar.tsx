'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
  Check,
  LogOut,
  PanelLeft,
  SquarePen,
  Monitor,
  Moon,
  MoreHorizontal,
  Sun,
  Trash2,
} from 'lucide-react';
import { logoutAction } from '@/app/(auth)/actions';
import type { Chat } from '@/lib/db/schema';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
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
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

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
  const { push, refresh } = useRouter();
  const queryClient = useQueryClient();
  const { setOpenMobile, toggleSidebar, state, isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [chatPendingDeleteId, setChatPendingDeleteId] = useState<string | null>(
    null,
  );

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
        push('/');
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
    push(`/chat/${chatId}`);
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

  const isCollapsed = state === 'collapsed' && !isMobile;
  const emailInitial = user.email.charAt(0).toUpperCase();
  const effectiveTheme = mounted ? (theme ?? 'system') : 'system';
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
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-3 p-2 pt-3">
        <div className="flex h-9 items-center justify-between px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="text-xl font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Nyusha
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            onClick={toggleSidebar}
            aria-label={
              isCollapsed ? 'Открыть боковую панель' : 'Закрыть боковую панель'
            }
            title={
              isCollapsed ? 'Открыть боковую панель' : 'Закрыть боковую панель'
            }
          >
            <PanelLeft className="size-5" strokeWidth={1.75} />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-10 justify-start gap-3 rounded-xl px-3 text-sm font-normal hover:bg-sidebar-accent group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
          aria-label="Новый чат"
          title={isCollapsed ? 'Новый чат' : undefined}
          onClick={() => {
            push('/');
            refresh();
            setOpenMobile(false);
          }}
        >
          <SquarePen className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="group-data-[collapsible=icon]:hidden">
            Новый чат
          </span>
        </Button>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <div className="group-data-[collapsible=icon]:hidden">
          <SidebarGroup className="pt-5">
            <SidebarGroupLabel className="mb-1 px-3 text-sm font-normal text-muted-foreground">
              Чаты
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {isLoading ? (
                <SidebarMenu>
                  {LOADING_SKELETON_WIDTHS.map((width) => (
                    <SidebarMenuItem key={width}>
                      <SidebarMenuSkeleton width={width} />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              ) : isError ? (
                <p
                  className="px-3 py-3 text-sm text-muted-foreground"
                  role="status"
                >
                  Не удалось загрузить чаты.
                </p>
              ) : chats.length === 0 ? (
                <p className="px-3 py-3 text-sm leading-relaxed text-muted-foreground">
                  Здесь появятся ваши разговоры.
                </p>
              ) : (
                <SidebarMenu className="gap-0.5">
                  {chats.map((chat) => {
                    const isDeleting =
                      deleteMutation.isPending &&
                      deleteMutation.variables === chat.id;
                    return (
                      <SidebarMenuItem key={chat.id}>
                        <SidebarMenuButton
                          isActive={activeChatId === chat.id}
                          aria-current={
                            activeChatId === chat.id ? 'page' : undefined
                          }
                          onClick={() => handleOpenChat(chat.id)}
                          className="h-10 rounded-xl px-3 text-sm data-[active=true]:font-normal"
                        >
                          <span className="truncate">{chat.title}</span>
                        </SidebarMenuButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction
                              showOnHover
                              className="right-2 top-2 size-6 peer-data-[size=default]/menu-button:top-2"
                              aria-label={`Действия с чатом «${chat.title}»`}
                            >
                              <MoreHorizontal className="size-4" />
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            side={isMobile ? 'bottom' : 'right'}
                            align="start"
                            className="w-52"
                          >
                            <DropdownMenuItem
                              disabled={isDeleting}
                              onSelect={() => handleDeleteChatRequest(chat.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4" />
                              <span>Удалить чат</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Меню аккаунта"
              className="flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#d4c4ad] text-sm font-medium text-[#473b2c]">
                {emailInitial}
              </span>
              <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-sm">{user.email}</span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  Личный аккаунт
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-64"
          >
            <DropdownMenuLabel className="truncate px-3 py-2 font-normal text-muted-foreground">
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-3 rounded-lg px-3 py-2.5">
                <ThemeIcon className="size-4" />
                <span>Тема</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {themeLabel}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                {(
                  [
                    { value: 'light', label: 'Светлая', icon: Sun },
                    { value: 'dark', label: 'Тёмная', icon: Moon },
                    { value: 'system', label: 'Системная', icon: Monitor },
                  ] as const
                ).map(({ value, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={value}
                    onSelect={() => setTheme(value)}
                  >
                    <Icon className="size-4" />
                    <span>{label}</span>
                    {effectiveTheme === value && (
                      <Check className="ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <form action={logoutAction}>
              <DropdownMenuItem
                asChild
                onSelect={(event) => event.preventDefault()}
              >
                <button type="submit" className="w-full">
                  <LogOut className="size-4" />
                  <span>Выйти</span>
                </button>
              </DropdownMenuItem>
            </form>
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
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl bg-popover p-6 sm:rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить чат?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Чат «${chats.find((chat) => chat.id === chatPendingDeleteId)?.title ?? ''}» будет удалён вместе с сообщениями. Это действие нельзя отменить.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-full"
              disabled={deleteMutation.isPending}
            >
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDeleteChatConfirm();
              }}
              disabled={deleteMutation.isPending}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Удаляем...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
