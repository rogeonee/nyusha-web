import { getCurrentUser } from '@/lib/auth/session';
import { getChatsByUserId } from '@/lib/db/queries';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const chats = await getChatsByUserId(user.id);

  return Response.json(chats);
}
