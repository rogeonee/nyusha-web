import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Register | Nyusha Chat',
  description: 'Create an invited private family chat account.',
};

const registerErrorMessages: Record<string, string> = {
  invalid_data: 'Введите корректные email и пароль (минимум 8 символов).',
  not_invited: 'Регистрация доступна только для приглашенных email.',
  user_exists: 'Пользователь с таким email уже существует.',
  server_error:
    'Ошибка регистрации. Проверь переменные окружения и базу данных.',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [user, { error }] = await Promise.all([getCurrentUser(), searchParams]);

  if (user) {
    redirect('/');
  }

  const errorMessage = error ? registerErrorMessages[error] : undefined;

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center px-6 py-20">
      <span className="absolute top-6 left-6 text-xl font-semibold tracking-tight">
        Nyusha
      </span>
      <div className="w-full max-w-[360px]">
        <h1 className="mb-3 text-center text-3xl font-medium tracking-tight">
          Добро пожаловать
        </h1>
        <p className="mb-8 text-center text-sm leading-relaxed text-muted-foreground">
          Регистрация доступна только по списку приглашенных email.
        </p>
        <RegisterForm errorMessage={errorMessage} />
      </div>
    </div>
  );
}
