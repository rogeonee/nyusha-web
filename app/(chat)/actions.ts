'use server';

import { getCurrentUser } from '@/lib/auth/session';
import { deleteMessagesFromId } from '@/lib/db/queries';

export async function deleteTrailingMessages({ id }: { id: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  await deleteMessagesFromId(id);
}
