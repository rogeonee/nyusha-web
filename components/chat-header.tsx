'use client';

import { useRouter } from 'next/navigation';
import { PanelLeft, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

export function ChatHeader() {
  const { push, refresh } = useRouter();
  const { toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <Button variant="outline" className="h-fit px-2" onClick={toggleSidebar}>
        <PanelLeft className="size-4" />
      </Button>

      <Button
        variant="outline"
        className="h-fit px-2"
        onClick={() => {
          push('/');
          refresh();
        }}
      >
        <SquarePen className="size-4" />
      </Button>
    </header>
  );
}
