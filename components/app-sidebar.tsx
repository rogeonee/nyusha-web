'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, PanelLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Chat } from '@/lib/db/schema';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from '@/components/ui/sidebar';

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

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setOpenMobile, toggleSidebar, open, isMobile } = useSidebar();
  const [showExpandedNewChat, setShowExpandedNewChat] = useState(
    open || isMobile,
  );

  useEffect(() => {
    if (isMobile) {
      setShowExpandedNewChat(true);
      return;
    }

    if (open) {
      const timeoutId = window.setTimeout(() => {
        setShowExpandedNewChat(true);
      }, 180);

      return () => window.clearTimeout(timeoutId);
    }

    setShowExpandedNewChat(false);
  }, [open, isMobile]);

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

      if (pathname === `/chat/${deletedChatId}`) {
        router.push('/');
      }
    },
  });

  const activeChatId = pathname.startsWith('/chat/')
    ? pathname.replace('/chat/', '').split('/')[0]
    : null;

  const handleNewChat = () => {
    router.push('/');
    setOpenMobile(false);
  };

  const handleOpenChat = (chatId: string) => {
    router.push(`/chat/${chatId}`);
    setOpenMobile(false);
  };

  const handleDeleteChat = (chatId: string) => {
    deleteMutation.mutate(chatId);
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-sidebar"
    >
      <SidebarHeader className="p-0 gap-0">
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border/70 px-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
            <div className="flex size-8 items-center justify-center rounded-md border border-sidebar-border/80 bg-sidebar-accent/30 font-semibold text-[11px]">
              N
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 border-sidebar-border bg-sidebar hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Свернуть/развернуть сайдбар"
            onClick={toggleSidebar}
          >
            <PanelLeft className="size-4" />
          </Button>
        </div>

        <div className="hidden px-2 py-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Новый чат"
            onClick={handleNewChat}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div
            className={
              showExpandedNewChat
                ? 'opacity-100'
                : 'pointer-events-none opacity-0'
            }
          >
            <Button
              variant="ghost"
              className="h-10 w-full justify-start gap-2 overflow-hidden whitespace-nowrap px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={handleNewChat}
            >
              <Plus className="size-4 shrink-0" />
              <span className="truncate">Новый чат</span>
            </Button>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Чаты</SidebarGroupLabel>
          <SidebarGroupContent>
            {isLoading ? (
              <SidebarMenu>
                {[1, 2, 3, 4].map((index) => (
                  <SidebarMenuItem key={index}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : isError ? (
              <p className="px-2 py-2 text-sidebar-foreground/70 text-xs">
                Не удалось загрузить чаты.
              </p>
            ) : chats.length === 0 ? (
              <p className="px-2 py-2 text-sidebar-foreground/70 text-xs">
                Нет чатов
              </p>
            ) : (
              <SidebarMenu>
                {chats.map((chat) => {
                  const isDeleting =
                    deleteMutation.isPending &&
                    deleteMutation.variables === chat.id;

                  return (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        isActive={activeChatId === chat.id}
                        onClick={() => handleOpenChat(chat.id)}
                      >
                        <MessageSquare className="size-4" />
                        <span>{chat.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        aria-label="Удалить чат"
                        disabled={isDeleting}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteChat(chat.id);
                        }}
                        className="hover:bg-destructive/15 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
