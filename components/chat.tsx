'use client';

import { Card } from '@/components/ui/card';
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconArrowUp } from '@/components/ui/icons';
import AboutCard from '@/components/cards/aboutcard';

export default function Chat() {
  const [input, setInput] = useState<string>('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const getMessageText = (message: UIMessage) =>
    message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt) return;

    await sendMessage({ text: prompt });
    setInput('');
  };

  return (
    <div className="group w-full overflow-auto ">
      {messages.length <= 0 ? (
        <AboutCard />
      ) : (
        <div className="max-w-xl mx-auto mt-10 mb-24">
          {messages.map((message, index) => (
            <div key={index} className="whitespace-pre-wrap flex mb-5">
              <div
                className={`${
                  message.role === 'user'
                    ? 'bg-secondary ml-auto'
                    : 'bg-transparent'
                } p-2 rounded-lg`}
              >
                {getMessageText(message)}
              </div>
            </div>
          ))}
          {status === 'submitted' || status === 'streaming' ? (
            <div className="whitespace-pre-wrap flex mb-5">
              <div className="bg-transparent p-2 rounded-lg text-muted-foreground">
                Думаю...
              </div>
            </div>
          ) : null}
        </div>
      )}
      <div className="fixed inset-x-0 bottom-10 w-full ">
        <div className="w-full max-w-xl mx-auto">
          <Card className="p-2">
            <form onSubmit={handleSubmit}>
              <div className="flex">
                <Input
                  type="text"
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                  }}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 w-[95%] mr-2 border-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none shadow-none"
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
