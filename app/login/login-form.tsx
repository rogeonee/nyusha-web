import Form from 'next/form';
import Link from 'next/link';
import { loginAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm({ errorMessage }: { errorMessage?: string }) {
  return (
    <Form action={loginAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Минимум 8 символов"
          required
          minLength={8}
        />
      </div>
      {errorMessage ? (
        <p className="text-sm text-red-500">{errorMessage}</p>
      ) : null}
      <Button className="w-full" type="submit">
        Войти
      </Button>
      <p className="text-sm text-muted-foreground">
        Нет аккаунта?{' '}
        <Link className="underline underline-offset-4" href="/register">
          Зарегистрироваться
        </Link>
      </p>
    </Form>
  );
}
