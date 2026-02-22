import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lte,
  sql,
} from 'drizzle-orm';
import { DEFAULT_CHAT_MODEL, type ChatModelId } from '@/lib/ai/models';
import { getDb } from '@/lib/db';
import {
  assistantGenerationReservations,
  chatFiles,
  chats,
  messageFileAttachments,
  messages,
  sessions,
  users,
} from '@/lib/db/schema';

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return user ?? null;
}

export async function recordFailedLoginAttempt({
  userId,
  lockoutThreshold,
  lockoutDurationMinutes,
}: {
  userId: string;
  lockoutThreshold: number;
  lockoutDurationMinutes: number;
}) {
  const db = getDb();
  const nextAttemptsExpr = sql<number>`
    CASE
      WHEN ${users.lastFailedLoginAt} IS NOT NULL
        AND ${users.lastFailedLoginAt} >= now() - make_interval(mins => ${lockoutDurationMinutes})
      THEN ${users.failedLoginAttempts} + 1
      ELSE 1
    END
  `;

  const [updatedUser] = await db
    .update(users)
    .set({
      failedLoginAttempts: nextAttemptsExpr,
      lastFailedLoginAt: sql`now()`,
      lockedUntil: sql`
        CASE
          WHEN (${nextAttemptsExpr}) >= ${lockoutThreshold}
          THEN now() + make_interval(mins => ${lockoutDurationMinutes})
          ELSE NULL
        END
      `,
    })
    .where(eq(users.id, userId))
    .returning({
      failedLoginAttempts: users.failedLoginAttempts,
      lockedUntil: users.lockedUntil,
    });

  return updatedUser ?? null;
}

export async function resetFailedLoginAttempts(userId: string) {
  const db = getDb();

  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      lockedUntil: null,
    })
    .where(eq(users.id, userId));
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
  modelId = DEFAULT_CHAT_MODEL,
}: {
  id: string;
  userId: string;
  title: string;
  modelId?: ChatModelId;
}) {
  const db = getDb();
  const [chat] = await db
    .insert(chats)
    .values({ id, userId, title, modelId })
    .returning();
  return chat;
}

export async function createChatIfAbsent({
  id,
  userId,
  title,
  modelId = DEFAULT_CHAT_MODEL,
}: {
  id: string;
  userId: string;
  title: string;
  modelId?: ChatModelId;
}) {
  const db = getDb();
  const [inserted] = await db
    .insert(chats)
    .values({ id, userId, title, modelId })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return inserted;
  }

  const [chat] = await db.select().from(chats).where(eq(chats.id, id));
  return chat ?? null;
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

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  const db = getDb();
  const [chat] = await db
    .update(chats)
    .set({ title })
    .where(eq(chats.id, chatId))
    .returning();

  return chat ?? null;
}

export async function updateChatModelById({
  chatId,
  modelId,
}: {
  chatId: string;
  modelId: ChatModelId;
}) {
  const db = getDb();
  const [chat] = await db
    .update(chats)
    .set({ modelId })
    .where(eq(chats.id, chatId))
    .returning();

  return chat ?? null;
}

export async function saveMessages(
  msgs: { id: string; chatId: string; role: string; parts: unknown }[],
) {
  const db = getDb();
  if (msgs.length === 0) return;
  await db.insert(messages).values(msgs).onConflictDoNothing();
}

export async function saveMessageIfAbsent(msg: {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
}) {
  const db = getDb();
  const inserted = await db
    .insert(messages)
    .values(msg)
    .onConflictDoNothing()
    .returning({ id: messages.id });

  return inserted.length > 0;
}

export async function saveUserMessageWithAttachmentsIfAbsent({
  messageId,
  chatId,
  parts,
  fileIds,
}: {
  messageId: string;
  chatId: string;
  parts: unknown;
  fileIds: string[];
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(messages)
      .values({
        id: messageId,
        chatId,
        role: 'user',
        parts,
      })
      .onConflictDoNothing()
      .returning({ id: messages.id });

    if (inserted.length === 0) {
      return { inserted: false as const };
    }

    if (fileIds.length > 0) {
      await tx
        .insert(messageFileAttachments)
        .values(
          fileIds.map((fileId) => ({
            messageId,
            chatId,
            fileId,
          })),
        )
        .onConflictDoNothing();
    }

    return { inserted: true as const };
  });
}

export async function createChatFile({
  chatId,
  userId,
  filename,
  mediaType,
  sizeBytes,
  storageProvider,
  storageKey,
  storageUrl,
  status = 'uploaded',
}: {
  chatId: string;
  userId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  storageProvider: string;
  storageKey: string;
  storageUrl: string;
  status?: string;
}) {
  const db = getDb();
  const [file] = await db
    .insert(chatFiles)
    .values({
      chatId,
      userId,
      filename,
      mediaType,
      sizeBytes,
      storageProvider,
      storageKey,
      storageUrl,
      status,
    })
    .returning();

  return file;
}

export async function getChatFileById({
  fileId,
  userId,
  chatId,
}: {
  fileId: string;
  userId: string;
  chatId: string;
}) {
  const db = getDb();
  const [file] = await db
    .select()
    .from(chatFiles)
    .where(
      and(
        eq(chatFiles.id, fileId),
        eq(chatFiles.userId, userId),
        eq(chatFiles.chatId, chatId),
      ),
    );

  return file ?? null;
}

export async function getChatFileByStorageKeyForUserChat({
  storageKey,
  userId,
  chatId,
}: {
  storageKey: string;
  userId: string;
  chatId: string;
}) {
  const db = getDb();
  const [file] = await db
    .select()
    .from(chatFiles)
    .where(
      and(
        eq(chatFiles.storageKey, storageKey),
        eq(chatFiles.userId, userId),
        eq(chatFiles.chatId, chatId),
      ),
    );

  return file ?? null;
}

export async function getChatFilesByIdsForUserChat({
  fileIds,
  userId,
  chatId,
}: {
  fileIds: string[];
  userId: string;
  chatId: string;
}) {
  if (fileIds.length === 0) {
    return [];
  }

  const db = getDb();
  return db
    .select()
    .from(chatFiles)
    .where(
      and(
        eq(chatFiles.userId, userId),
        eq(chatFiles.chatId, chatId),
        inArray(chatFiles.id, fileIds),
      ),
    );
}

export async function getChatFilesByChatId(chatId: string) {
  const db = getDb();
  return db
    .select()
    .from(chatFiles)
    .where(eq(chatFiles.chatId, chatId))
    .orderBy(asc(chatFiles.createdAt));
}

export async function attachFilesToMessage({
  messageId,
  chatId,
  fileIds,
}: {
  messageId: string;
  chatId: string;
  fileIds: string[];
}) {
  if (fileIds.length === 0) {
    return;
  }

  const db = getDb();
  await db
    .insert(messageFileAttachments)
    .values(
      fileIds.map((fileId) => ({
        messageId,
        chatId,
        fileId,
      })),
    )
    .onConflictDoNothing();
}

export type DeleteMessageTailForUserResult =
  | { ok: true; deletedCount: number }
  | { ok: false; code: 'not_found' };

export async function deleteMessageTailForUser({
  userId,
  messageId,
}: {
  userId: string;
  messageId: string;
}): Promise<DeleteMessageTailForUserResult> {
  const db = getDb();
  const [target] = await db
    .select({
      chatId: messages.chatId,
      chatUserId: chats.userId,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(eq(messages.id, messageId));

  if (!target || target.chatUserId !== userId) {
    return { ok: false, code: 'not_found' };
  }

  const chatMessageRows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.chatId, target.chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  const fromIndex = chatMessageRows.findIndex((row) => row.id === messageId);

  if (fromIndex < 0) {
    return { ok: false, code: 'not_found' };
  }

  const idsToDelete = chatMessageRows.slice(fromIndex).map((row) => row.id);

  if (idsToDelete.length === 0) {
    return { ok: true, deletedCount: 0 };
  }

  await db
    .delete(messages)
    .where(
      and(
        eq(messages.chatId, target.chatId),
        inArray(messages.id, idsToDelete),
      ),
    );

  return { ok: true, deletedCount: idsToDelete.length };
}

export async function getAssistantMessageCountByUserId(
  userId: string,
  hoursBack: number,
) {
  const db = getDb();
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const [stats] = await db
    .select({ count: count(messages.id) })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(
      and(
        eq(chats.userId, userId),
        eq(messages.role, 'assistant'),
        gte(messages.createdAt, since),
      ),
    );
  return stats?.count ?? 0;
}

export async function reserveAssistantGenerationSlot({
  userId,
  dailyLimit,
  hoursBack,
  reservationTtlMinutes,
}: {
  userId: string;
  dailyLimit: number;
  hoursBack: number;
  reservationTtlMinutes: number;
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const now = new Date();
    const since = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    const expiresAt = new Date(
      now.getTime() + reservationTtlMinutes * 60 * 1000,
    );

    // Serialize quota checks per user under READ COMMITTED.
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

    await tx
      .delete(assistantGenerationReservations)
      .where(lte(assistantGenerationReservations.expiresAt, now));

    const [assistantStats] = await tx
      .select({ count: count(messages.id) })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(
        and(
          eq(chats.userId, userId),
          eq(messages.role, 'assistant'),
          gte(messages.createdAt, since),
        ),
      );

    const [reservationStats] = await tx
      .select({ count: count(assistantGenerationReservations.id) })
      .from(assistantGenerationReservations)
      .where(
        and(
          eq(assistantGenerationReservations.userId, userId),
          gt(assistantGenerationReservations.expiresAt, now),
        ),
      );

    const usedSlots =
      (assistantStats?.count ?? 0) + (reservationStats?.count ?? 0);

    if (usedSlots >= dailyLimit) {
      return { ok: false as const };
    }

    const [reservation] = await tx
      .insert(assistantGenerationReservations)
      .values({
        userId,
        expiresAt,
      })
      .returning({ id: assistantGenerationReservations.id });

    return { ok: true as const, reservationId: reservation.id };
  });
}

export async function releaseAssistantGenerationSlot(reservationId: string) {
  const db = getDb();

  await db
    .delete(assistantGenerationReservations)
    .where(eq(assistantGenerationReservations.id, reservationId));
}

export async function getMessageByIdAndChatId({
  messageId,
  chatId,
}: {
  messageId: string;
  chatId: string;
}) {
  const db = getDb();
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)));

  return message ?? null;
}

export async function getMessagesByChatId(chatId: string) {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));
}
