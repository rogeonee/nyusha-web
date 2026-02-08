import { compare, genSaltSync, hashSync } from 'bcrypt-ts';

const PASSWORD_ROUNDS = 10;

export function hashPassword(password: string) {
  const salt = genSaltSync(PASSWORD_ROUNDS);
  return hashSync(password, salt);
}

export async function verifyPassword(password: string, hashedPassword: string) {
  return compare(password, hashedPassword);
}
