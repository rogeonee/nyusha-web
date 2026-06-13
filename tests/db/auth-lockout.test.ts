import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { createTestDb } = await import('../helpers/test-db');
  const db = await createTestDb();
  return { getDb: () => db } as unknown as typeof import('@/lib/db');
});

import { getDb } from '@/lib/db';
import {
  recordFailedLoginAttempt,
  resetFailedLoginAttempts,
} from '@/lib/db/queries';
import { users } from '@/lib/db/schema';

const lockoutOptions = {
  lockoutThreshold: 5,
  lockoutDurationMinutes: 15,
};

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

async function getUser(userId: string) {
  const [user] = await getDb().select().from(users).where(eq(users.id, userId));
  return user;
}

describe('recordFailedLoginAttempt', () => {
  it('sets the counter to one on the first failure without locking', async () => {
    const userId = await seedUser();

    const result = await recordFailedLoginAttempt({
      userId,
      ...lockoutOptions,
    });

    expect(result).toEqual({
      failedLoginAttempts: 1,
      lockedUntil: null,
    });
  });

  it('increments failures within the window', async () => {
    const userId = await seedUser();
    await recordFailedLoginAttempt({ userId, ...lockoutOptions });

    const result = await recordFailedLoginAttempt({
      userId,
      ...lockoutOptions,
    });

    expect(result).toEqual({
      failedLoginAttempts: 2,
      lockedUntil: null,
    });
  });

  it('locks when failures reach the threshold', async () => {
    const userId = await seedUser();
    let result = null;
    for (let index = 0; index < 5; index += 1) {
      result = await recordFailedLoginAttempt({
        userId,
        ...lockoutOptions,
      });
    }

    expect(result?.failedLoginAttempts).toBe(5);
    expect(result?.lockedUntil).toBeInstanceOf(Date);
    expect(result?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it('resets a stale failure window to one attempt', async () => {
    const userId = await seedUser();
    await getDb()
      .update(users)
      .set({
        failedLoginAttempts: 4,
        lastFailedLoginAt: new Date(Date.now() - 16 * 60 * 1000),
      })
      .where(eq(users.id, userId));

    const result = await recordFailedLoginAttempt({
      userId,
      ...lockoutOptions,
    });

    expect(result).toEqual({
      failedLoginAttempts: 1,
      lockedUntil: null,
    });
  });

  it('reset clears all lockout fields', async () => {
    const userId = await seedUser();
    for (let index = 0; index < 5; index += 1) {
      await recordFailedLoginAttempt({
        userId,
        ...lockoutOptions,
      });
    }

    await resetFailedLoginAttempts(userId);

    expect(await getUser(userId)).toMatchObject({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastFailedLoginAt: null,
    });
  });

  it('returns null for an unknown user', async () => {
    const result = await recordFailedLoginAttempt({
      userId: crypto.randomUUID(),
      ...lockoutOptions,
    });

    expect(result).toBeNull();
  });
});
