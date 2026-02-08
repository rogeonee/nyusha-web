'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isAllowedFamilyEmail } from '@/lib/auth/allowlist';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createUserSession, destroyCurrentSession } from '@/lib/auth/session';
import { createUser, getUserByEmail } from '@/lib/db/queries';

const authFormSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

function redirectWithError(path: '/login' | '/register', error: string): never {
  const params = new URLSearchParams({ error });
  redirect(`${path}?${params.toString()}`);
}

export async function loginAction(formData: FormData) {
  const parsed = authFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    redirectWithError('/login', 'invalid_data');
  }

  const email = parsed.data.email.toLowerCase();
  const user = await getUserByEmail(email).catch(() =>
    redirectWithError('/login', 'server_error'),
  );

  if (!user) {
    redirectWithError('/login', 'invalid_credentials');
  }

  let isValidPassword = false;

  try {
    isValidPassword = await verifyPassword(
      parsed.data.password,
      user.passwordHash,
    );
  } catch {
    redirectWithError('/login', 'server_error');
  }

  if (!isValidPassword) {
    redirectWithError('/login', 'invalid_credentials');
  }

  try {
    await createUserSession(user.id);
  } catch {
    redirectWithError('/login', 'server_error');
  }

  redirect('/');
}

export async function registerAction(formData: FormData) {
  const parsed = authFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    redirectWithError('/register', 'invalid_data');
  }

  const email = parsed.data.email.toLowerCase();

  if (!isAllowedFamilyEmail(email)) {
    redirectWithError('/register', 'not_invited');
  }

  const existingUser = await getUserByEmail(email).catch(() =>
    redirectWithError('/register', 'server_error'),
  );

  if (existingUser) {
    redirectWithError('/register', 'user_exists');
  }

  let passwordHash = '';

  try {
    passwordHash = hashPassword(parsed.data.password);
  } catch {
    redirectWithError('/register', 'server_error');
  }

  const createdUser = await createUser({ email, passwordHash }).catch(() =>
    redirectWithError('/register', 'server_error'),
  );

  await createUserSession(createdUser.id).catch(() =>
    redirectWithError('/register', 'server_error'),
  );

  redirect('/');
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect('/login');
}
