'use client';

import { Card } from '@/components/ui/card';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { upload as uploadToBlob } from '@vercel/blob/client';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { IconArrowUp, IconStop } from '@/components/ui/icons';
import {
  CheckIcon,
  ChevronRight,
  ClipboardIcon,
  PaperclipIcon,
  PencilIcon,
  RotateCcwIcon,
  XIcon,
} from 'lucide-react';
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
import { toast } from 'sonner';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { MessageEditor } from '@/components/message-editor';
import { deleteTrailingMessages } from '@/app/(chat)/actions';
import {
  DEFAULT_CHAT_MODEL,
  getChatModelById,
  resolveChatModelId,
  type ChatModelId,
} from '@/lib/ai/models';

const OFFLINE_ERROR_MESSAGE =
  'Нет подключения к интернету. Проверьте соединение и попробуйте снова.';
const FILE_UPLOAD_ERROR_MESSAGE =
  'Не удалось загрузить файл. Попробуйте еще раз.';
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = [
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
] as const;
const mathPlugin = createMathPlugin({ singleDollarTextMath: true });
type BlobAccessMode = 'private' | 'public';

type PendingAttachment = {
  fileId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
};

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
      {copied ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <ClipboardIcon className="size-3.5" />
      )}
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
    <div className="mt-1 flex items-center justify-end gap-1 opacity-100 pointer-events-auto transition-opacity md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto">
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
  isDisabled,
}: {
  text: string;
  latencyMs: number | null;
  onRegenerate: () => void;
  isDisabled: boolean;
}) {
  const formatLatency = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} min, ${seconds} sec`;
  };

  return (
    <div className="mt-1 flex w-full items-center gap-1">
      <CopyButton text={text} />
      <button
        className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        onClick={onRegenerate}
        disabled={isDisabled}
        title="Повторить"
      >
        <RotateCcwIcon className="size-3.5" />
      </button>
      {latencyMs !== null && (
        <span className="ml-1 text-xs text-muted-foreground">
          {formatLatency(latencyMs)}
        </span>
      )}
    </div>
  );
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(value: string) {
  const normalized = value.trim().replace(/\s+/g, '-');
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]/g, '-');
  const collapsed = cleaned.replace(/-+/g, '-');
  const clipped = collapsed.slice(0, 120);

  return clipped.length > 0 ? clipped : 'file';
}

function buildStoragePath(chatId: string, filename: string) {
  return `${chatId}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFilename(
    filename,
  )}`;
}

function isAccessModeMismatchError(
  error: unknown,
  attemptedAccess: BlobAccessMode,
) {
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return false;
  }

  const message = String(error.message);

  return attemptedAccess === 'public'
    ? message.includes('Cannot use public access on a private store')
    : message.includes('Cannot use private access on a public store');
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
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
            trigger: request.trigger,
            messageId: request.messageId,
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

  useEffect(() => {
    if (!isAwaitingResponse) {
      setThinkingElapsedMs(0);
      return;
    }

    const startedAt =
      sendTimeRef.current > 0 ? sendTimeRef.current : Date.now();

    const tick = () => {
      setThinkingElapsedMs(Math.max(0, Date.now() - startedAt));
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAwaitingResponse]);

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

  const getMessageFiles = (message: UIMessage) =>
    message.parts.flatMap((part) => {
      if (part.type !== 'file') {
        return [];
      }

      const fileId =
        'fileId' in part && typeof part.fileId === 'string'
          ? part.fileId
          : null;
      const filename = part.filename?.trim() || 'Файл';

      return [
        {
          fileId,
          filename,
          mediaType: part.mediaType,
        },
      ];
    });

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
  const formatElapsedThinking = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} min, ${seconds} sec`;
  };

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      if (!isOnline) {
        toast.error(OFFLINE_ERROR_MESSAGE);
        return;
      }

      if (
        pendingAttachments.length + files.length >
        MAX_ATTACHMENTS_PER_MESSAGE
      ) {
        toast.error(
          `Можно прикрепить не более ${MAX_ATTACHMENTS_PER_MESSAGE} файлов за сообщение.`,
        );
        return;
      }

      const oversizedFile = files.find(
        (file) => file.size > MAX_UPLOAD_SIZE_BYTES,
      );

      if (oversizedFile) {
        toast.error(
          `Размер файла не должен превышать ${Math.floor(
            MAX_UPLOAD_SIZE_BYTES / 1024 / 1024,
          )} MB.`,
        );
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        const settledUploads = await Promise.allSettled(
          files.map(async (file) => {
            if (
              file.type &&
              !ALLOWED_MEDIA_TYPES.includes(
                file.type as (typeof ALLOWED_MEDIA_TYPES)[number],
              )
            ) {
              throw new Error('Неподдерживаемый тип файла.');
            }

            const pathname = buildStoragePath(id, file.name);
            const clientPayload = JSON.stringify({
              chatId: id,
              filename: file.name,
              mediaType: file.type || undefined,
            });

            let blob:
              | {
                  pathname: string;
                }
              | undefined;

            for (const access of ['private', 'public'] as const) {
              try {
                blob = await uploadToBlob(pathname, file, {
                  access,
                  handleUploadUrl: '/api/files/upload-token',
                  clientPayload,
                  multipart: file.size >= 8 * 1024 * 1024,
                });
                break;
              } catch (uploadError) {
                if (!isAccessModeMismatchError(uploadError, access)) {
                  throw uploadError;
                }
              }
            }

            if (!blob) {
              throw new Error(FILE_UPLOAD_ERROR_MESSAGE);
            }

            const response = await fetch('/api/files/upload', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                chatId: id,
                pathname: blob.pathname,
                filename: file.name,
              }),
            });

            let data: unknown = null;

            try {
              data = await response.json();
            } catch {
              data = null;
            }

            if (!response.ok) {
              const message =
                typeof data === 'object' &&
                data !== null &&
                'error' in data &&
                typeof data.error === 'string'
                  ? data.error
                  : FILE_UPLOAD_ERROR_MESSAGE;
              throw new Error(message);
            }

            return data as PendingAttachment;
          }),
        );

        const succeeded = settledUploads.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        );
        const failed = settledUploads
          .filter((result) => result.status === 'rejected')
          .map((result) =>
            result.reason instanceof Error
              ? result.reason.message
              : FILE_UPLOAD_ERROR_MESSAGE,
          );

        if (succeeded.length > 0) {
          setPendingAttachments((current) => [...current, ...succeeded]);
        }

        if (failed.length > 0) {
          const message =
            failed.length === 1
              ? failed[0]
              : `Не удалось загрузить ${failed.length} файла(ов).`;
          setUploadError(message);
          toast.error(message);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : FILE_UPLOAD_ERROR_MESSAGE;
        setUploadError(message);
        toast.error(message);
      } finally {
        setIsUploading(false);
      }
    },
    [id, isOnline, pendingAttachments.length],
  );

  const handleFilePickerChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = '';
    await uploadFiles(files);
  };

  const removePendingAttachment = (fileId: string) => {
    setPendingAttachments((current) =>
      current.filter((file) => file.fileId !== fileId),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      toast.error(OFFLINE_ERROR_MESSAGE);
      return;
    }

    if (isUploading) {
      return;
    }

    const prompt = input.trim();
    if (!prompt && pendingAttachments.length === 0) return;

    setRegenerateError(null);
    setUploadError(null);
    const attachmentsForMessage = [...pendingAttachments];
    setInput('');
    setPendingAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const parts: Array<
      | { type: 'text'; text: string }
      | {
          type: 'file';
          url: string;
          mediaType: string;
          filename: string;
          fileId: string;
        }
    > = [
      ...attachmentsForMessage.map((file) => ({
        type: 'file' as const,
        url: file.fileId,
        mediaType: file.mediaType,
        filename: file.filename,
        fileId: file.fileId,
      })),
      ...(prompt ? [{ type: 'text' as const, text: prompt }] : []),
    ];

    void sendMessage({
      role: 'user',
      parts: parts as UIMessage['parts'],
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      if (!isOnline) {
        toast.error(OFFLINE_ERROR_MESSAGE);
        return;
      }

      if (isUploading) {
        return;
      }

      void handleSubmit(e);
    }
  };

  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (isRegenerating) {
        return;
      }

      if (!isOnline) {
        toast.error(OFFLINE_ERROR_MESSAGE);
        return;
      }

      setRegenerateError(null);
      setIsRegenerating(true);

      try {
        const deletionResult = await deleteTrailingMessages({ id: messageId });

        if (!deletionResult.ok) {
          setRegenerateError(deletionResult.message);
          return;
        }

        await regenerate({ messageId });
      } catch {
        setRegenerateError('Не удалось повторить ответ. Попробуйте снова.');
      } finally {
        setIsRegenerating(false);
      }
    },
    [isOnline, isRegenerating, regenerate],
  );

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
                {messages.map((message) => {
                  const text = getMessageText(message);
                  const files = getMessageFiles(message);
                  const hasText = text.trim().length > 0;

                  if (
                    message.role === 'assistant' &&
                    !hasText &&
                    files.length === 0
                  ) {
                    return null;
                  }

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
                      key={message.id}
                      className={`mb-5 flex flex-col ${
                        message.role === 'user'
                          ? 'group items-end'
                          : 'items-start'
                      }`}
                    >
                      <div
                        className={`group relative ${
                          message.role === 'user'
                            ? `${
                                isEditing ? 'w-full ' : ''
                              }max-w-[85%] whitespace-pre-wrap`
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
                            {files.length > 0 ? (
                              <div className="mb-2 flex flex-wrap gap-1.5">
                                {files.map((file, index) => (
                                  <div
                                    key={`${message.id}-file-${index}`}
                                    className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/70 px-2 py-1 text-xs text-muted-foreground"
                                  >
                                    <PaperclipIcon className="size-3" />
                                    <span className="truncate max-w-[200px]">
                                      {file.filename}
                                    </span>
                                  </div>
                                ))}
                              </div>
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
                        !isEditing &&
                        hasText && (
                          <UserMessageActions
                            text={text}
                            onEdit={() => setEditingMessageId(message.id)}
                          />
                        )}

                      {isLastAssistant && status === 'ready' && (
                        <AssistantMessageActions
                          text={text}
                          latencyMs={lastLatencyMs}
                          onRegenerate={() => void handleRegenerate(message.id)}
                          isDisabled={isRegenerating || !isOnline}
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
                          <div className="flex items-center gap-3">
                            <CollapsibleTrigger className="group/trigger flex items-center gap-1 transition-colors hover:text-foreground">
                              <ChevronRight className="size-3 transition-transform group-data-[state=open]/trigger:rotate-90" />
                              <TextShimmer className="text-sm" duration={3}>
                                {latestChunkTitle}
                              </TextShimmer>
                            </CollapsibleTrigger>
                            <span className="text-xs tabular-nums text-muted-foreground/80">
                              {formatElapsedThinking(thinkingElapsedMs)}
                            </span>
                          </div>
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
                        <div className="flex items-center gap-3">
                          <TextShimmer className="text-sm" duration={3}>
                            {`${
                              getChatModelById(currentModelId).name
                            } думает...`}
                          </TextShimmer>
                          <span className="text-xs tabular-nums text-muted-foreground/80">
                            {formatElapsedThinking(thinkingElapsedMs)}
                          </span>
                        </div>
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
                {regenerateError ? (
                  <div className="mb-4 text-sm text-destructive">
                    Ошибка: {regenerateError}
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
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.txt,image/jpeg,image/png"
                multiple
                onChange={(event) => {
                  void handleFilePickerChange(event);
                }}
              />
              {pendingAttachments.length > 0 ? (
                <div className="flex flex-wrap gap-1 px-1">
                  {pendingAttachments.map((file) => (
                    <div
                      key={file.fileId}
                      className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-secondary/80 px-2 py-1 text-xs text-muted-foreground"
                    >
                      <PaperclipIcon className="size-3" />
                      <span className="max-w-[200px] truncate">
                        {file.filename}
                      </span>
                      <span className="text-muted-foreground/70">
                        {formatFileSize(file.sizeBytes)}
                      </span>
                      <button
                        type="button"
                        className="rounded p-0.5 transition-colors hover:bg-background"
                        onClick={() => removePendingAttachment(file.fileId)}
                        title="Удалить вложение"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {isUploading ? (
                <p className="px-1 text-xs text-muted-foreground">
                  Загружаем файлы...
                </p>
              ) : null}
              {uploadError ? (
                <p className="px-1 text-xs text-destructive">{uploadError}</p>
              ) : null}
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mr-1 mb-0.5"
                  disabled={!isOnline || isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  title="Прикрепить файл"
                >
                  <PaperclipIcon className="size-4" />
                </Button>
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
                    disabled={
                      (!input.trim() && pendingAttachments.length === 0) ||
                      !isOnline ||
                      isUploading
                    }
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
