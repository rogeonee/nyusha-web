'use client';

import { Card } from '@/components/ui/card';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { IconArrowUp, IconStop } from '@/components/ui/icons';
import { CheckIcon, ChevronRight, ClipboardIcon, PencilIcon, RotateCcwIcon } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import {
  ReasoningBlock,
  parseReasoningChunks,
} from '@/components/reasoning-block';
import AboutCard from '@/components/cards/aboutcard';
import { ChatHeader } from '@/components/chat-header';
import { ChatModelSelector } from '@/components/chat-model-selector';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { MessageEditor } from '@/components/message-editor';
import { deleteTrailingMessages } from '@/app/(chat)/actions';

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_CHAT_MODEL,
  getChatModelById,
  resolveChatModelId,
  type ChatModelId,
} from '@/lib/ai/models';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => void handleCopy()}
      title="Копировать"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <ClipboardIcon className="size-3.5" />}
    </button>
  );
}

function UserMessageActions({
  text,
  onEdit,
}: {
  text: string;
  onEdit: () => void;
}) {
  return (
    <div className="mt-1 flex items-center justify-end gap-1">
      <CopyButton text={text} />
      <button
        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        onClick={onEdit}
        title="Редактировать"
      >
        <PencilIcon className="size-3.5" />
      </button>
    </div>
  );
}

function AssistantMessageActions({
  text,
  latencyMs,
  onRegenerate,
}: {
  text: string;
  latencyMs: number | null;
  onRegenerate: () => void;
}) {
  return (
    <div className="mt-1 flex w-full items-center gap-1">
      <CopyButton text={text} />
      <button
        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        onClick={onRegenerate}
        title="Повторить"
      >
        <RotateCcwIcon className="size-3.5" />
      </button>
      {latencyMs !== null && (
        <span className="ml-1 text-xs text-muted-foreground">
          {(latencyMs / 1000).toFixed(1)}с
        </span>
      )}
    </div>
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentModelIdRef = useRef<ChatModelId>(currentModelId);
  const sendTimeRef = useRef<number>(0);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  // Offline detection
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const {
    messages,
    sendMessage,
    status,
    error,
    regenerate,
    setMessages,
    stop,
  } = useChat({
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

  // Latency tracking
  useEffect(() => {
    if (status === 'submitted') {
      sendTimeRef.current = Date.now();
      setLastLatencyMs(null);
    } else if (status === 'ready' && sendTimeRef.current > 0) {
      setLastLatencyMs(Date.now() - sendTimeRef.current);
      sendTimeRef.current = 0;
    }
  }, [status]);

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

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    void sendMessage({ text: prompt });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e);
    }
  };

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-background">
      <ChatHeader />

      <div className="relative flex-1">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-2 sm:px-4">
            {!isOnline && (
              <div className="mx-auto mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Нет соединения с интернетом
              </div>
            )}
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

                  const isLastAssistant =
                    message.role === 'assistant' &&
                    message.id === lastAssistantMessage?.id;

                  const isEditing = editingMessageId === message.id;

                  return (
                    <div
                      key={index}
                      className={`mb-5 flex flex-col ${
                        message.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`group relative ${
                          message.role === 'user'
                            ? `${isEditing ? 'w-full ' : ''}max-w-[85%] whitespace-pre-wrap`
                            : 'w-full'
                        }`}
                      >
                        {isEditing ? (
                          <MessageEditor
                            message={message}
                            setMode={(mode) => {
                              if (mode === 'view') setEditingMessageId(null);
                            }}
                            setMessages={setMessages}
                            regenerate={regenerate}
                          />
                        ) : (
                          <div
                            className={`${
                              message.role === 'user'
                                ? 'bg-secondary'
                                : 'bg-transparent w-full'
                            } rounded-lg p-2`}
                          >
                            {reasoning ? (
                              <ReasoningBlock text={reasoning} />
                            ) : null}
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
                        )}

                      </div>

                      {message.role === 'user' &&
                        !isAwaitingResponse &&
                        !isEditing && (
                          <UserMessageActions
                            text={text}
                            onEdit={() => setEditingMessageId(message.id)}
                          />
                        )}

                      {isLastAssistant && status === 'ready' && (
                        <AssistantMessageActions
                          text={text}
                          latencyMs={lastLatencyMs}
                          onRegenerate={async () => {
                            await deleteTrailingMessages({ id: message.id });
                            regenerate();
                          }}
                        />
                      )}
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
                {status === 'error' && error && (
                  <div className="mb-4 text-sm text-destructive">
                    Ошибка: {error.message}
                  </div>
                )}
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
              <div className="flex items-end">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    resizeTextarea();
                  }}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="mr-2 max-h-[200px] min-h-10 w-[95%] resize-none border-0 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground shadow-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="Спроси что-нибудь..."
                />
                {isAwaitingResponse ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mb-0.5"
                    onClick={stop}
                  >
                    <IconStop />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!input.trim()}
                    className="mb-0.5"
                  >
                    <IconArrowUp />
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
