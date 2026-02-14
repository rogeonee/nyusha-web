'use client';

import { Card } from '@/components/ui/card';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconArrowUp } from '@/components/ui/icons';
import AboutCard from '@/components/cards/aboutcard';

export default function Chat() {
  const [input, setInput] = useState<string>('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      block: 'end',
      behavior: status === 'streaming' ? 'auto' : 'smooth',
    });
  }, [messages, status]);

  const getMessageText = (message: UIMessage) =>
    message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt) return;

    setInput('');
    void sendMessage({ text: prompt });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div className="flex-1 overflow-y-auto px-2 sm:px-4">
        {messages.length <= 0 ? (
          <div className="mx-auto mt-10 w-full max-w-xl">
            <AboutCard />
          </div>
        ) : (
          <div className="mx-auto mt-10 w-full max-w-xl">
            {messages.map((message, index) => (
              <div key={index} className="mb-5 flex whitespace-pre-wrap">
                <div
                  className={`${
                    message.role === 'user'
                      ? 'bg-secondary ml-auto'
                      : 'bg-transparent'
                  } rounded-lg p-2`}
                >
                  {getMessageText(message)}
                </div>
              </div>
            ))}
            {status === 'submitted' || status === 'streaming' ? (
              <div className="mb-5 flex whitespace-pre-wrap">
                <div className="rounded-lg bg-transparent p-2 text-muted-foreground">
                  Думаю...
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <div className="bg-background/95 px-2 pb-4 sm:px-4">
        <div className="mx-auto w-full max-w-xl">
          <Card className="p-2">
            <form onSubmit={handleSubmit}>
              <div className="flex">
                <Input
                  type="text"
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                  }}
                  className="mr-2 h-10 w-[95%] border-0 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="Спроси что-нибудь..."
                />
                <Button disabled={!input.trim()}>
                  <IconArrowUp />
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
