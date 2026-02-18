'use server';

import { getCurrentUser } from '@/lib/auth/session';
import { deleteMessageTailForUser } from '@/lib/db/queries';

type DeleteTrailingMessagesResult =
  | { ok: true; deletedCount: number }
  | { ok: false; code: 'not_found'; message: string };

export async function deleteTrailingMessages({
  id,
}: {
  id: string;
}): Promise<DeleteTrailingMessagesResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      code: 'not_found',
      message: 'Сообщение не найдено.',
    };
  }

  const result = await deleteMessageTailForUser({
    userId: user.id,
    messageId: id,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: 'not_found',
      message: 'Сообщение не найдено.',
    };
  }

  return { ok: true, deletedCount: result.deletedCount };
}
