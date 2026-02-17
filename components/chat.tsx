'use client';

import { Card } from '@/components/ui/card';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconArrowUp } from '@/components/ui/icons';
import { ChevronRight } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });
import AboutCard from '@/components/cards/aboutcard';
import { ChatHeader } from '@/components/chat-header';
import { ChatModelSelector } from '@/components/chat-model-selector';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_CHAT_MODEL,
  getChatModelById,
  resolveChatModelId,
  type ChatModelId,
} from '@/lib/ai/models';

interface ReasoningChunk {
  title: string;
  body: string;
}

function parseReasoningChunks(text: string): ReasoningChunk[] {
  const chunks: ReasoningChunk[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  const titles: { title: string; index: number; length: number }[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    titles.push({
      title: match[1],
      index: match.index,
      length: match[0].length,
    });
  }

  for (let i = 0; i < titles.length; i++) {
    const start = titles[i].index + titles[i].length;
    const end = i + 1 < titles.length ? titles[i + 1].index : text.length;
    chunks.push({
      title: titles[i].title,
      body: text.slice(start, end).trim(),
    });
  }

  return chunks;
}

function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const normalizedText = text.trim();
  const chunks = parseReasoningChunks(normalizedText);
  const hasStructuredChunks = chunks.length > 0;

  if (!normalizedText) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
      <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight
          className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        Мысли модели
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {hasStructuredChunks ? (
          chunks.map((chunk, i) => (
            <div key={i}>
              <div className="font-medium">{chunk.title}</div>
              {chunk.body ? <div className="mt-0.5">{chunk.body}</div> : null}
            </div>
          ))
        ) : (
          <div className="whitespace-pre-wrap">{normalizedText}</div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

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

  const getReasoningText = (message: UIMessage) =>
    message.parts
      .filter((part) => part.type === 'reasoning')
      .map((part) => part.text)
      .join('');

  const streamingReasoningText = lastAssistantMessage
    ? getReasoningText(lastAssistantMessage)
    : '';
  const normalizedStreamingReasoningText = streamingReasoningText.trim();
  const streamingChunks = parseReasoningChunks(
    normalizedStreamingReasoningText,
  );
  const hasStructuredStreamingChunks = streamingChunks.length > 0;
  const latestChunkTitle = hasStructuredStreamingChunks
    ? streamingChunks[streamingChunks.length - 1].title
    : 'Мысли модели';

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
              <div className="mt-10 w-full">
                {messages.map((message, index) => {
                  const text = getMessageText(message);

                  if (message.role === 'assistant' && !text) return null;

                  const reasoning =
                    message.role === 'assistant'
                      ? getReasoningText(message)
                      : '';

                  return (
                    <div
                      key={index}
                      className={`mb-5 flex ${
                        message.role === 'user'
                          ? 'justify-end whitespace-pre-wrap'
                          : ''
                      }`}
                    >
                      <div
                        className={`${
                          message.role === 'user'
                            ? 'bg-secondary'
                            : 'bg-transparent w-full'
                        } rounded-lg p-2`}
                      >
                        {reasoning ? <ReasoningBlock text={reasoning} /> : null}
                        {message.role === 'assistant' ? (
                          <Streamdown
                            className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:mx-auto [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden"
                            plugins={{ math: mathPlugin }}
                          >
                            {text}
                          </Streamdown>
                        ) : (
                          text
                        )}
                      </div>
                    </div>
                  );
                })}
                {isThinking ? (
                  <div className="mb-5 flex whitespace-pre-wrap">
                    <div className="rounded-lg bg-transparent p-2 text-sm text-muted-foreground">
                      {normalizedStreamingReasoningText ? (
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-1 hover:text-foreground transition-colors">
                            <ChevronRight className="size-3" />
                            {latestChunkTitle}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1.5 space-y-2 pl-4">
                            {hasStructuredStreamingChunks ? (
                              streamingChunks.map((chunk, i) => (
                                <div key={i}>
                                  <div className="font-medium">
                                    {chunk.title}
                                  </div>
                                  {chunk.body ? (
                                    <div className="mt-0.5">{chunk.body}</div>
                                  ) : null}
                                </div>
                              ))
                            ) : (
                              <div className="whitespace-pre-wrap">
                                {normalizedStreamingReasoningText}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      ) : (
                        <span className="text-sm">
                          {getChatModelById(currentModelId).name} думает...
                        </span>
                      )}
                      {showLongWaitNotice ? (
                        <div className="mt-2 leading-relaxed">
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
