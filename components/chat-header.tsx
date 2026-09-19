'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PanelLeft, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

export function ChatHeader({ children }: { children?: ReactNode }) {
  const { push, refresh } = useRouter();
  const { toggleSidebar } = useSidebar();

  return (
    <header className="z-10 flex h-14 shrink-0 items-center gap-2 bg-background px-3 md:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 rounded-xl md:hidden"
        onClick={toggleSidebar}
        aria-label="Открыть боковую панель"
      >
        <PanelLeft className="size-5" strokeWidth={1.75} />
      </Button>
      {children}
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto shrink-0 rounded-xl md:hidden"
        aria-label="Новый чат"
        onClick={() => {
          push('/');
          refresh();
        }}
      >
        <SquarePen className="size-5" strokeWidth={1.75} />
      </Button>
    </header>
  );
}
