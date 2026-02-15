import { randomUUID } from 'crypto';
import Chat from '@/components/chat';

export default function NewChatPage() {
  const id = randomUUID();

  return (
    <div className="relative flex h-full flex-col p-4 sm:p-0">
      <Chat id={id} />
    </div>
  );
}
