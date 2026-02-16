import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import Chat from '@/components/chat';
import type { UIMessage } from 'ai';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    notFound();
  }

  const chat = await getChatById(id);

  if (!chat || chat.userId !== user.id) {
    notFound();
  }

  const dbMessages = await getMessagesByChatId(id);

  const initialMessages: UIMessage[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as UIMessage['role'],
    parts: m.parts as UIMessage['parts'],
    createdAt: m.createdAt,
  }));

  return <Chat id={id} initialMessages={initialMessages} />;
}
