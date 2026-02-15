import Link from 'next/link';
import { logoutAction } from '@/app/(auth)/actions';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';

export default function ChatHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border/70 bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="hidden md:flex min-w-0 items-center gap-2 pl-1">
        <Link
          href="/"
          rel="nofollow"
          className="truncate font-semibold text-sm tracking-tight"
        >
          Nyusha Chat
        </Link>
      </div>

      <div className="md:hidden min-w-0 pl-1" />

      <div className="flex items-center gap-2">
        <ModeToggle />
        <form action={logoutAction}>
          <Button type="submit" variant="outline">
            Выйти
          </Button>
        </form>
      </div>
    </header>
  );
}
