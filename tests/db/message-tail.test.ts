import { asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { createTestDb } = await import('../helpers/test-db');
  const db = await createTestDb();
  return { getDb: () => db } as unknown as typeof import('@/lib/db');
});

import { getDb } from '@/lib/db';
import { deleteMessageTailForUser } from '@/lib/db/queries';
import { chats, messages, users } from '@/lib/db/schema';

async function seedUser() {
  const [user] = await getDb()
    .insert(users)
    .values({
      email: `${crypto.randomUUID()}@example.test`,
      passwordHash: 'x',
    })
    .returning({ id: users.id });
  return user.id;
}

async function seedChatWithMessages() {
  const db = getDb();
  const userId = await seedUser();
  const chatId = crypto.randomUUID();
  await db.insert(chats).values({
    id: chatId,
    userId,
    title: 'T',
  });
  const baseTime = Date.now() - 20 * 60 * 1000;
  const messageIds = Array.from({ length: 4 }, (_, index) => ({
    id: `${crypto.randomUUID()}-m${index + 1}`,
    chatId,
    role: index % 2 === 0 ? 'user' : 'assistant',
    parts: [],
    createdAt: new Date(baseTime + index * 4 * 60 * 1000),
  }));
  await db.insert(messages).values(messageIds);
  return {
    userId,
    chatId,
    ids: messageIds.map((message) => message.id),
  };
}

async function getMessageIds(chatId: string) {
  const rows = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  return rows.map((row) => row.id);
}

describe('deleteMessageTailForUser', () => {
  it('deletes the target and everything after it', async () => {
    const { userId, chatId, ids } = await seedChatWithMessages();

    const result = await deleteMessageTailForUser({
      userId,
      messageId: ids[1],
    });

    expect(result).toEqual({ ok: true, deletedCount: 3 });
    expect(await getMessageIds(chatId)).toEqual([ids[0]]);
  });

  it('deleting the last message removes one row', async () => {
    const { userId, chatId, ids } = await seedChatWithMessages();

    const result = await deleteMessageTailForUser({
      userId,
      messageId: ids[3],
    });

    expect(result).toEqual({ ok: true, deletedCount: 1 });
    expect(await getMessageIds(chatId)).toEqual(ids.slice(0, 3));
  });

  it('returns not_found for a foreign user', async () => {
    const { chatId, ids } = await seedChatWithMessages();
    const foreignUserId = await seedUser();

    const result = await deleteMessageTailForUser({
      userId: foreignUserId,
      messageId: ids[1],
    });

    expect(result).toEqual({ ok: false, code: 'not_found' });
    expect(await getMessageIds(chatId)).toEqual(ids);
  });

  it('returns not_found for an unknown message', async () => {
    const { userId } = await seedChatWithMessages();

    const result = await deleteMessageTailForUser({
      userId,
      messageId: 'unknown-message',
    });

    expect(result).toEqual({ ok: false, code: 'not_found' });
  });

  it('tie-breaks equal createdAt by id', async () => {
    const db = getDb();
    const userId = await seedUser();
    const chatId = crypto.randomUUID();
    const createdAt = new Date();
    await db.insert(chats).values({
      id: chatId,
      userId,
      title: 'T',
    });
    await db.insert(messages).values([
      {
        id: 'aaa',
        chatId,
        role: 'user',
        parts: [],
        createdAt,
      },
      {
        id: 'bbb',
        chatId,
        role: 'assistant',
        parts: [],
        createdAt,
      },
    ]);

    const result = await deleteMessageTailForUser({
      userId,
      messageId: 'aaa',
    });

    expect(result).toEqual({ ok: true, deletedCount: 2 });
    expect(await getMessageIds(chatId)).toEqual([]);
  });
});
