import Link from 'next/link';
import { logoutAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth/session';
import EnvCard from './cards/envcard';
import { ModeToggle } from './mode-toggle';

export default async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between w-full h-16 px-4 border-b shrink-0 ">
      <EnvCard />
      <Link href="/" rel="nofollow" className="mr-2 font-bold">
        Nyusha Chat with Gemini
      </Link>
      <div className="flex items-center gap-2">
        {user ? (
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Выйти
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Регистрация</Link>
            </Button>
          </div>
        )}
        <ModeToggle />
      </div>
    </header>
  );
}
