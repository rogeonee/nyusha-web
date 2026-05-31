import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import {
  CHAT_REASONING_COOKIE_NAME,
  resolveChatModelId,
  resolveChatReasoningLevelId,
} from '@/lib/ai/models';
import Chat from '@/components/chat';
import type { UIMessage } from 'ai';

export const metadata: Metadata = {
  title: 'Chat | Nyusha Chat',
  description: 'Private family chat history.',
};

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  if (!user) {
    notFound();
  }

  const chat = await getChatById(id);

  if (!chat || chat.userId !== user.id) {
    notFound();
  }

  const dbMessages = await getMessagesByChatId(id);
  const initialChatModel = resolveChatModelId(chat.modelId);
  const cookieStore = await cookies();
  const initialReasoningLevel = resolveChatReasoningLevelId(
    cookieStore.get(CHAT_REASONING_COOKIE_NAME)?.value,
  );

  const initialMessages: UIMessage[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as UIMessage['role'],
    parts: m.parts as UIMessage['parts'],
    createdAt: m.createdAt,
  }));

  return (
    <Chat
      id={id}
      initialMessages={initialMessages}
      initialChatModel={initialChatModel}
      initialReasoningLevel={initialReasoningLevel}
    />
  );
}
