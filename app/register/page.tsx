import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { RegisterForm } from './register-form';

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
  const user = await getCurrentUser();
  const { error } = await searchParams;

  if (user) {
    redirect('/');
  }

  const errorMessage = error ? registerErrorMessages[error] : undefined;

  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-4 py-8 md:py-12">
      <Card className="w-full max-w-md p-6">
        <h1 className="mb-2 text-xl font-semibold">
          Регистрация в Nyusha Chat
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Регистрация доступна только по списку приглашенных email.
        </p>
        <RegisterForm errorMessage={errorMessage} />
      </Card>
    </div>
  );
}
