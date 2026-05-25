import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import Chat from '@/components/chat';
import {
  CHAT_MODEL_COOKIE_NAME,
  CHAT_REASONING_COOKIE_NAME,
  resolveChatModelId,
  resolveChatReasoningLevelId,
} from '@/lib/ai/models';

export default async function NewChatPage() {
  const id = randomUUID();
  const cookieStore = await cookies();
  const initialChatModel = resolveChatModelId(
    cookieStore.get(CHAT_MODEL_COOKIE_NAME)?.value,
  );
  const initialReasoningLevel = resolveChatReasoningLevelId(
    cookieStore.get(CHAT_REASONING_COOKIE_NAME)?.value,
  );

  return (
    <Chat
      id={id}
      initialChatModel={initialChatModel}
      initialReasoningLevel={initialReasoningLevel}
    />
  );
}
