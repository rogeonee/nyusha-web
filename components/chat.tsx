'use client';

import { Card } from '@/components/ui/card';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconArrowUp } from '@/components/ui/icons';
import AboutCard from '@/components/cards/aboutcard';
import { ChatHeader } from '@/components/chat-header';
import { ChatModelSelector } from '@/components/chat-model-selector';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_CHAT_MODEL,
  getChatModelById,
  resolveChatModelId,
  type ChatModelId,
} from '@/lib/ai/models';

export default function Chat({
  id,
  initialMessages = [],
  initialChatModel = DEFAULT_CHAT_MODEL,
}: {
  id: string;
  initialMessages?: UIMessage[];
  initialChatModel?: string;
}) {
  const [input, setInput] = useState<string>('');
  const [showLongWaitNotice, setShowLongWaitNotice] = useState(false);
  const [currentModelId, setCurrentModelId] = useState<ChatModelId>(
    resolveChatModelId(initialChatModel),
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentModelIdRef = useRef<ChatModelId>(currentModelId);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const { messages, sendMessage, status } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest(request) {
        return {
          body: {
            id: request.id,
            messages: request.messages,
            selectedChatModel: currentModelIdRef.current,
          },
        };
      },
    }),
    onFinish: () => {
      if (pathname === '/') {
        router.replace(`/chat/${id}`);
      }
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
  const isAwaitingResponse = status === 'submitted' || status === 'streaming';

  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');
  const assistantHasText =
    lastAssistantMessage?.parts.some(
      (p) => p.type === 'text' && p.text.length > 0,
    ) ?? false;
  const isThinking = isAwaitingResponse && !assistantHasText;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: status === 'streaming' ? 'auto' : 'smooth',
    });
  }, [messages, status]);

  useEffect(() => {
    if (!isAwaitingResponse) {
      setShowLongWaitNotice(false);
      return;
    }

    setShowLongWaitNotice(false);

    const longWaitTimer = window.setTimeout(() => {
      setShowLongWaitNotice(true);
    }, 30_000);

    return () => {
      window.clearTimeout(longWaitTimer);
    };
  }, [isAwaitingResponse]);

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
    <div className="flex h-dvh min-w-0 flex-col bg-background">
      <ChatHeader />

      <div className="relative flex-1">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-2 sm:px-4">
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
                {isThinking ? (
                  <div className="mb-5 flex whitespace-pre-wrap">
                    <div className="rounded-lg bg-transparent p-2 text-muted-foreground">
                      {getChatModelById(currentModelId).name} думает...
                      {showLongWaitNotice ? (
                        <div className="mt-2 text-xs leading-relaxed">
                          Это может занять чуть больше времени. Все в порядке,
                          запрос еще обрабатывается.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-background px-2 pb-4 sm:px-4">
        <div className="mx-auto w-full max-w-3xl">
          <Card className="p-2">
            <form onSubmit={handleSubmit} className="space-y-1.5">
              <div className="px-1">
                <ChatModelSelector
                  selectedModelId={currentModelId}
                  onModelChange={setCurrentModelId}
                />
              </div>
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
