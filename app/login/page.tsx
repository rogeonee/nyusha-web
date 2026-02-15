import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

const loginErrorMessages: Record<string, string> = {
  invalid_data: 'Введите корректные email и пароль (минимум 8 символов).',
  invalid_credentials: 'Неверные email или пароль.',
  server_error: 'Ошибка входа. Проверь переменные окружения и базу данных.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  const { error } = await searchParams;

  if (user) {
    redirect('/');
  }

  const errorMessage = error ? loginErrorMessages[error] : undefined;

  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-4 py-8 md:py-12">
      <Card className="w-full max-w-md p-6">
        <h1 className="mb-2 text-xl font-semibold">Вход в Nyusha Chat</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Используйте приглашенный email и пароль.
        </p>
        <LoginForm errorMessage={errorMessage} />
      </Card>
    </div>
  );
}
