import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { createTestDb } = await import('../helpers/test-db');
  const db = await createTestDb();
  return { getDb: () => db } as unknown as typeof import('@/lib/db');
});

import { getDb } from '@/lib/db';
import { saveUserMessageWithAttachmentsIfAbsent } from '@/lib/db/queries';
import {
  chatFiles,
  chats,
  messageFileAttachments,
  messages,
  users,
} from '@/lib/db/schema';

async function seedUserAndChat() {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `${crypto.randomUUID()}@example.test`,
      passwordHash: 'x',
    })
    .returning({ id: users.id });
  const chatId = crypto.randomUUID();
  await db.insert(chats).values({
    id: chatId,
    userId: user.id,
    title: 'T',
  });
  return { userId: user.id, chatId };
}

async function seedChatFile({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}) {
  const uniqueKey = crypto.randomUUID();
  const [file] = await getDb()
    .insert(chatFiles)
    .values({
      chatId,
      userId,
      filename: 'x.png',
      mediaType: 'image/png',
      sizeBytes: 1,
      storageProvider: 'vercel-blob',
      storageKey: uniqueKey,
      storageUrl: `https://example.test/${uniqueKey}`,
    })
    .returning({ id: chatFiles.id });
  return file.id;
}

describe('saveUserMessageWithAttachmentsIfAbsent', () => {
  it('inserts the message and attachment links', async () => {
    const { userId, chatId } = await seedUserAndChat();
    const fileId = await seedChatFile({ chatId, userId });
    const messageId = crypto.randomUUID();

    const result = await saveUserMessageWithAttachmentsIfAbsent({
      messageId,
      chatId,
      parts: [{ type: 'text', text: 'hello' }],
      fileIds: [fileId],
    });

    expect(result).toEqual({ inserted: true });
    const messageRows = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    expect(messageRows).toHaveLength(1);
    const attachmentRows = await getDb()
      .select()
      .from(messageFileAttachments)
      .where(eq(messageFileAttachments.messageId, messageId));
    expect(attachmentRows).toHaveLength(1);
    expect(attachmentRows[0]).toMatchObject({
      messageId,
      chatId,
      fileId,
    });
  });

  it('treats a duplicate message id as a no-op', async () => {
    const { userId, chatId } = await seedUserAndChat();
    const fileId = await seedChatFile({ chatId, userId });
    const messageId = crypto.randomUUID();
    const input = {
      messageId,
      chatId,
      parts: [{ type: 'text', text: 'hello' }],
      fileIds: [fileId],
    };

    expect(await saveUserMessageWithAttachmentsIfAbsent(input)).toEqual({
      inserted: true,
    });
    expect(await saveUserMessageWithAttachmentsIfAbsent(input)).toEqual({
      inserted: false,
    });

    const messageRows = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    const attachmentRows = await getDb()
      .select()
      .from(messageFileAttachments)
      .where(eq(messageFileAttachments.messageId, messageId));
    expect(messageRows).toHaveLength(1);
    expect(attachmentRows).toHaveLength(1);
  });

  it('creates no attachment rows when fileIds is empty', async () => {
    const { chatId } = await seedUserAndChat();
    const messageId = crypto.randomUUID();

    const result = await saveUserMessageWithAttachmentsIfAbsent({
      messageId,
      chatId,
      parts: [{ type: 'text', text: 'hello' }],
      fileIds: [],
    });

    expect(result).toEqual({ inserted: true });
    const attachmentRows = await getDb()
      .select()
      .from(messageFileAttachments)
      .where(eq(messageFileAttachments.messageId, messageId));
    expect(attachmentRows).toHaveLength(0);
  });
});
