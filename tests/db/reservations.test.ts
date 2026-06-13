import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { createTestDb } = await import('../helpers/test-db');
  const db = await createTestDb();
  return { getDb: () => db } as unknown as typeof import('@/lib/db');
});

import { getDb } from '@/lib/db';
import {
  releaseAssistantGenerationSlot,
  reserveAssistantGenerationSlot,
} from '@/lib/db/queries';
import {
  assistantGenerationReservations,
  chats,
  messages,
  users,
} from '@/lib/db/schema';

const quotaOptions = {
  dailyLimit: 3,
  hoursBack: 24,
  reservationTtlMinutes: 5,
};

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

async function seedAssistantMessages({
  chatId,
  count,
  createdAt,
}: {
  chatId: string;
  count: number;
  createdAt: Date;
}) {
  const db = getDb();
  await db.insert(messages).values(
    Array.from({ length: count }, () => ({
      id: crypto.randomUUID(),
      chatId,
      role: 'assistant',
      parts: [],
      createdAt,
    })),
  );
}

describe('reserveAssistantGenerationSlot', () => {
  it('grants a slot under the limit', async () => {
    const { userId } = await seedUserAndChat();

    const result = await reserveAssistantGenerationSlot({
      userId,
      ...quotaOptions,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a reservation');
    }
    expect(result.reservationId).toEqual(expect.any(String));

    const rows = await getDb()
      .select()
      .from(assistantGenerationReservations)
      .where(eq(assistantGenerationReservations.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it('denies when persisted assistant messages reach the limit', async () => {
    const { userId, chatId } = await seedUserAndChat();
    await seedAssistantMessages({
      chatId,
      count: 3,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const result = await reserveAssistantGenerationSlot({
      userId,
      ...quotaOptions,
    });

    expect(result).toEqual({ ok: false });
  });

  it('ignores assistant messages outside the window', async () => {
    const { userId, chatId } = await seedUserAndChat();
    await seedAssistantMessages({
      chatId,
      count: 3,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const result = await reserveAssistantGenerationSlot({
      userId,
      ...quotaOptions,
    });

    expect(result.ok).toBe(true);
  });

  it('counts active reservations toward the limit', async () => {
    const { userId } = await seedUserAndChat();

    for (let index = 0; index < 3; index += 1) {
      const result = await reserveAssistantGenerationSlot({
        userId,
        ...quotaOptions,
      });
      expect(result.ok).toBe(true);
    }

    const denied = await reserveAssistantGenerationSlot({
      userId,
      ...quotaOptions,
    });
    expect(denied).toEqual({ ok: false });
  });

  it('prunes expired reservations', async () => {
    const { userId, chatId } = await seedUserAndChat();
    const expiredId = crypto.randomUUID();
    await getDb()
      .insert(assistantGenerationReservations)
      .values({
        id: expiredId,
        userId,
        expiresAt: new Date(Date.now() - 60 * 1000),
      });
    await seedAssistantMessages({
      chatId,
      count: 2,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const result = await reserveAssistantGenerationSlot({
      userId,
      ...quotaOptions,
    });

    expect(result.ok).toBe(true);
    const expiredRows = await getDb()
      .select()
      .from(assistantGenerationReservations)
      .where(
        and(
          eq(assistantGenerationReservations.userId, userId),
          eq(assistantGenerationReservations.id, expiredId),
        ),
      );
    expect(expiredRows).toHaveLength(0);
  });

  it('releases a reservation idempotently', async () => {
    const { userId } = await seedUserAndChat();
    const result = await reserveAssistantGenerationSlot({
      userId,
      ...quotaOptions,
    });
    if (!result.ok) {
      throw new Error('Expected a reservation');
    }

    await releaseAssistantGenerationSlot(result.reservationId);
    await releaseAssistantGenerationSlot(result.reservationId);

    const rows = await getDb()
      .select()
      .from(assistantGenerationReservations)
      .where(eq(assistantGenerationReservations.userId, userId));
    expect(rows).toHaveLength(0);
  });
});
