import { randomUUID } from 'crypto';
import Chat from '@/components/chat';

export default function NewChatPage() {
  const id = randomUUID();

  return <Chat id={id} />;
}
