import Form from 'next/form';
import Link from 'next/link';
import { registerAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RegisterForm({ errorMessage }: { errorMessage?: string }) {
  return (
    <Form action={registerAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          className="h-12 rounded-2xl px-4 text-base"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Минимум 8 символов"
          className="h-12 rounded-2xl px-4 text-base"
          required
          minLength={8}
        />
      </div>
      {errorMessage ? (
        <p className="text-sm text-red-500">{errorMessage}</p>
      ) : null}
      <Button className="h-12 w-full rounded-full text-base" type="submit">
        Зарегистрироваться
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{' '}
        <Link className="underline underline-offset-4" href="/login">
          Войти
        </Link>
      </p>
    </Form>
  );
}
