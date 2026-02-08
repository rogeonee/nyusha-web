import 'server-only';

import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sessions, users } from '@/lib/db/schema';

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return user ?? null;
}

export async function createUser({
  email,
  passwordHash,
}: {
  email: string;
  passwordHash: string;
}) {
  const db = getDb();
  const [createdUser] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
    })
    .returning();

  return createdUser;
}

export async function createSession({
  userId,
  expiresAt,
}: {
  userId: string;
  expiresAt: Date;
}) {
  const db = getDb();
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      expiresAt,
    })
    .returning();

  return session;
}

export async function getSessionWithUser(sessionId: string) {
  const db = getDb();
  const [result] = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      userEmail: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));

  if (!result) {
    return null;
  }

  return {
    session: {
      id: result.sessionId,
      userId: result.userId,
      expiresAt: result.expiresAt,
    },
    user: {
      id: result.userId,
      email: result.userEmail,
    },
  };
}

export async function deleteSession(sessionId: string) {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
