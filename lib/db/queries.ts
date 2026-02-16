import 'server-only';

import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { chats, messages, sessions, users } from '@/lib/db/schema';

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

export async function createChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  const db = getDb();
  const [chat] = await db
    .insert(chats)
    .values({ id, userId, title })
    .returning();
  return chat;
}

export async function getChatById(chatId: string) {
  const db = getDb();
  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
  return chat ?? null;
}

export async function getChatsByUserId(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.createdAt));
}

export async function deleteChatById(chatId: string) {
  const db = getDb();
  await db.delete(chats).where(eq(chats.id, chatId));
}

export async function saveMessages(
  msgs: { id: string; chatId: string; role: string; parts: unknown }[],
) {
  const db = getDb();
  if (msgs.length === 0) return;
  await db.insert(messages).values(msgs);
}

export async function getMessagesByChatId(chatId: string) {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));
}
