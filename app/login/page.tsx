import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Login | Nyusha Chat',
  description: 'Sign in to the private family chat.',
};

const loginErrorMessages: Record<string, string> = {
  invalid_data: 'Введите корректные email и пароль (минимум 8 символов).',
  invalid_credentials: 'Неверные email или пароль.',
  too_many_attempts:
    'Слишком много неудачных попыток. Попробуйте снова через 15 минут.',
  server_error: 'Ошибка входа. Проверь переменные окружения и базу данных.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [user, { error }] = await Promise.all([getCurrentUser(), searchParams]);

  if (user) {
    redirect('/');
  }

  const errorMessage = error ? loginErrorMessages[error] : undefined;

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center px-6 py-20">
      <span className="absolute top-6 left-6 text-xl font-semibold tracking-tight">
        Nyusha
      </span>
      <div className="w-full max-w-[360px]">
        <h1 className="mb-3 text-center text-3xl font-medium tracking-tight">
          С возвращением
        </h1>
        <p className="mb-8 text-center text-sm leading-relaxed text-muted-foreground">
          Используйте приглашенный email и пароль.
        </p>
        <LoginForm errorMessage={errorMessage} />
      </div>
    </div>
  );
}
