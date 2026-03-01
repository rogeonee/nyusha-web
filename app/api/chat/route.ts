import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type ProviderMetadata,
  type UIMessage,
} from 'ai';
import { google } from '@ai-sdk/google';
import mammoth from 'mammoth';
import { BlobNotFoundError, del } from '@vercel/blob';
import { DOCX_MEDIA_TYPE } from '@/lib/uploads';
import {
  deleteGeminiFile,
  uploadBytesToGeminiFile,
} from '@/lib/ai/google-files-api';
import {
  getChatModelById,
  getFallbackChatModelId,
  isChatModelId,
  resolveChatModelId,
  type ChatModelId,
} from '@/lib/ai/models';
import { getLanguageModel } from '@/lib/ai/providers';
import { getCurrentUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import {
  attachFilesToMessage,
  clearChatFileGeminiReference,
  createChat,
  deleteChatById,
  getChatById,
  getChatFilesByChatId,
  getChatFilesByIdsForUserChat,
  getChatFilesByIdsForUserChatForUpdate,
  getMessageByIdAndChatId,
  getMessagesByChatId,
  releaseAssistantGenerationSlot,
  reserveAssistantGenerationSlot,
  saveMessages,
  saveUserMessageWithAttachmentsIfAbsent,
  updateChatFileGeminiReference,
  updateChatTitleById,
  updateChatModelById,
} from '@/lib/db/queries';
import { type PostRequestBody, postRequestBodySchema } from './schema';

export const maxDuration = 300;
const DAILY_ASSISTANT_MESSAGE_LIMIT = 200;
const DAILY_LIMIT_WINDOW_HOURS = 24;
const ASSISTANT_RESERVATION_TTL_MINUTES = 5;
const DAILY_LIMIT_ERROR_MESSAGE =
  'Вы достигли дневного лимита сообщений. Попробуйте завтра.';
const DUPLICATE_MESSAGE_ERROR =
  'Это сообщение уже обработано. Обновите чат и попробуйте снова.';
const CHAT_CONFLICT_ERROR =
  'Состояние чата изменилось. Обновите страницу и повторите попытку.';
const INVALID_USER_MESSAGE_ERROR = 'Некорректное пользовательское сообщение.';
const INVALID_FILE_ERROR =
  'Некорректный файл. Загрузите файл заново и повторите попытку.';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GEMINI_FILES_REUSE_ENABLED =
  process.env.GEMINI_FILES_REUSE_ENABLED !== 'false';
const GEMINI_FILES_REFRESH_SKEW_MINUTES = Number.parseInt(
  process.env.GEMINI_FILES_REFRESH_SKEW_MINUTES ?? '10',
  10,
);
const GEMINI_FILES_REFRESH_MAX_PER_REQUEST = Number.parseInt(
  process.env.GEMINI_FILES_REFRESH_MAX_PER_REQUEST ?? '6',
  10,
);
const GEMINI_FILES_UPLOAD_TIMEOUT_MS = Number.parseInt(
  process.env.GEMINI_FILES_UPLOAD_TIMEOUT_MS ?? '30000',
  10,
);
const GEMINI_FILES_POLL_TIMEOUT_MS = Number.parseInt(
  process.env.GEMINI_FILES_POLL_TIMEOUT_MS ?? '20000',
  10,
);
const GEMINI_FILE_DEFAULT_TTL_MS = 47 * 60 * 60 * 1000;

const GEMINI_FILES_REFRESH_SKEW_MS =
  GEMINI_FILES_REFRESH_SKEW_MINUTES * 60 * 1000;
const GEMINI_FILES_REFRESH_LIMIT = GEMINI_FILES_REFRESH_MAX_PER_REQUEST;
const GEMINI_FILES_UPLOAD_TIMEOUT = GEMINI_FILES_UPLOAD_TIMEOUT_MS;
const GEMINI_FILES_POLL_TIMEOUT = GEMINI_FILES_POLL_TIMEOUT_MS;

function isUuid(value: string) {
  return UUID_REGEX.test(value);
}

function isGeminiFileUrl(url: string) {
  return url.startsWith(
    'https://generativelanguage.googleapis.com/v1beta/files/',
  );
}

function isGeminiUriReusable({
  geminiFileUri,
  geminiFileExpiresAt,
  now,
}: {
  geminiFileUri: string | null;
  geminiFileExpiresAt: Date | null;
  now: Date;
}) {
  if (!geminiFileUri || !geminiFileExpiresAt) {
    return false;
  }

  return (
    geminiFileExpiresAt.getTime() > now.getTime() + GEMINI_FILES_REFRESH_SKEW_MS
  );
}

function isCanonicalUserFilePart(part: unknown): part is {
  type: 'file';
  fileId: string;
} {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'file' &&
    'fileId' in part &&
    typeof part.fileId === 'string' &&
    isUuid(part.fileId)
  );
}

function isCanonicalUserTextPart(part: unknown): part is {
  type: 'text';
  text: string;
} {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'text' &&
    'text' in part &&
    typeof part.text === 'string'
  );
}

async function fetchStorageBytes({
  url,
  mediaType,
}: {
  url: string;
  mediaType: string;
}) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const parsed = new URL(url);
  const isVercelBlobUrl = parsed.hostname.endsWith('.blob.vercel-storage.com');
  const headers: HeadersInit = {};

  if (isVercelBlobUrl && blobToken) {
    headers.authorization = `Bearer ${blobToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GEMINI_FILES_UPLOAD_TIMEOUT,
  );

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download source file from Blob (${response.status})`,
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength === 0) {
      throw new Error('Source Blob file is empty.');
    }

    return {
      bytes,
      mediaType: response.headers.get('content-type') ?? mediaType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

type FileHydrationStats = {
  filePartsTotal: number;
  geminiUriReused: number;
  geminiUriRefreshed: number;
  blobFallbackCount: number;
};

type RuntimeHydratedMessages = {
  messages: UIMessage[];
  stats: FileHydrationStats;
};

async function refreshGeminiFileUriIfNeeded({
  fileId,
  userId,
  chatId,
  apiKey,
}: {
  fileId: string;
  userId: string;
  chatId: string;
  apiKey: string;
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [lockedFile] = await getChatFilesByIdsForUserChatForUpdate({
      tx,
      fileIds: [fileId],
      userId,
      chatId,
    });

    if (!lockedFile) {
      return null;
    }

    const now = new Date();

    if (
      isGeminiUriReusable({
        geminiFileUri: lockedFile.geminiFileUri,
        geminiFileExpiresAt: lockedFile.geminiFileExpiresAt,
        now,
      })
    ) {
      return {
        kind: 'reused' as const,
        uri: lockedFile.geminiFileUri as string,
      };
    }

    try {
      const source = await fetchStorageBytes({
        url: lockedFile.storageUrl,
        mediaType: lockedFile.mediaType,
      });
      const uploaded = await uploadBytesToGeminiFile({
        bytes: source.bytes,
        mediaType: source.mediaType,
        displayName: lockedFile.filename,
        apiKey,
        timeoutMs: GEMINI_FILES_UPLOAD_TIMEOUT,
        pollTimeoutMs: GEMINI_FILES_POLL_TIMEOUT,
      });

      const expiresAt =
        uploaded.expiresAt ?? new Date(Date.now() + GEMINI_FILE_DEFAULT_TTL_MS);

      const updated = await updateChatFileGeminiReference({
        tx,
        fileId: lockedFile.id,
        userId,
        chatId,
        geminiFileUri: uploaded.uri,
        geminiFileExpiresAt: expiresAt,
      });

      if (!updated?.geminiFileUri) {
        return null;
      }

      return {
        kind: 'refreshed' as const,
        uri: updated.geminiFileUri,
      };
    } catch (error) {
      console.error('Gemini file refresh failed, using Blob fallback:', {
        fileId: lockedFile.id,
        error,
      });

      await clearChatFileGeminiReference({
        tx,
        fileId: lockedFile.id,
        userId,
        chatId,
      });

      return null;
    }
  });
}

async function hydrateMessagesForModelContext({
  persistedUiMessages,
  userId,
  chatId,
  preferGeminiUri,
}: {
  persistedUiMessages: UIMessage[];
  userId: string;
  chatId: string;
  preferGeminiUri: boolean;
}): Promise<RuntimeHydratedMessages> {
  const stats: FileHydrationStats = {
    filePartsTotal: 0,
    geminiUriReused: 0,
    geminiUriRefreshed: 0,
    blobFallbackCount: 0,
  };
  const fileIds: string[] = [];
  const seenIds = new Set<string>();

  for (const message of persistedUiMessages) {
    if (message.role !== 'user') {
      continue;
    }

    for (const part of message.parts) {
      if (!isCanonicalUserFilePart(part)) {
        continue;
      }

      stats.filePartsTotal += 1;
      if (seenIds.has(part.fileId)) {
        continue;
      }

      seenIds.add(part.fileId);
      fileIds.push(part.fileId);
    }
  }

  if (fileIds.length === 0) {
    return { messages: persistedUiMessages, stats };
  }

  const chatFiles = await getChatFilesByIdsForUserChat({
    fileIds,
    userId,
    chatId,
  });
  const filesById = new Map(chatFiles.map((file) => [file.id, file]));
  const runtimeUrlByFileId = new Map<string, string>();
  const now = new Date();
  const canRefresh = preferGeminiUri && GEMINI_FILES_REUSE_ENABLED;
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  let refreshAttempts = 0;

  for (const fileId of fileIds) {
    const file = filesById.get(fileId);

    if (!file) {
      stats.blobFallbackCount += 1;
      continue;
    }

    if (file.mediaType === DOCX_MEDIA_TYPE) {
      runtimeUrlByFileId.set(file.id, file.storageUrl);
      stats.blobFallbackCount += 1;
      continue;
    }

    if (
      preferGeminiUri &&
      isGeminiUriReusable({
        geminiFileUri: file.geminiFileUri,
        geminiFileExpiresAt: file.geminiFileExpiresAt,
        now,
      })
    ) {
      runtimeUrlByFileId.set(file.id, file.geminiFileUri as string);
      stats.geminiUriReused += 1;
      continue;
    }

    if (canRefresh && apiKey && refreshAttempts < GEMINI_FILES_REFRESH_LIMIT) {
      refreshAttempts += 1;
      const refreshed = await refreshGeminiFileUriIfNeeded({
        fileId: file.id,
        userId,
        chatId,
        apiKey,
      });

      if (refreshed?.uri) {
        runtimeUrlByFileId.set(file.id, refreshed.uri);
        if (refreshed.kind === 'refreshed') {
          stats.geminiUriRefreshed += 1;
        } else {
          stats.geminiUriReused += 1;
        }
        continue;
      }
    }

    runtimeUrlByFileId.set(file.id, file.storageUrl);
    stats.blobFallbackCount += 1;
  }

  const hydratedMessages: UIMessage[] = [];

  for (const message of persistedUiMessages) {
    if (message.role !== 'user') {
      hydratedMessages.push(message);
      continue;
    }

    const hydratedParts: UIMessage['parts'] = [];

    for (const part of message.parts) {
      if (isCanonicalUserTextPart(part)) {
        hydratedParts.push(part);
        continue;
      }

      if (!isCanonicalUserFilePart(part)) {
        hydratedParts.push(part);
        continue;
      }

      const file = filesById.get(part.fileId);

      if (!file) {
        continue;
      }

      const runtimeUrl = runtimeUrlByFileId.get(file.id) ?? file.storageUrl;

      if (file.mediaType === DOCX_MEDIA_TYPE) {
        try {
          const source = await fetchStorageBytes({
            url: file.storageUrl,
            mediaType: file.mediaType,
          });
          const { value: extractedText } = await mammoth.extractRawText({
            buffer: Buffer.from(source.bytes),
          });
          hydratedParts.push({
            type: 'text',
            text: `[File: ${file.filename}]\n\n${extractedText}`,
          });
        } catch (error) {
          console.error('DOCX text extraction failed:', {
            fileId: file.id,
            error,
          });
          hydratedParts.push({
            type: 'text',
            text: `[File: ${file.filename}] (не удалось извлечь текст)`,
          });
        }
        continue;
      }

      hydratedParts.push({
        type: 'file',
        url: runtimeUrl,
        mediaType: file.mediaType,
        filename: file.filename,
      } as UIMessage['parts'][number]);
    }

    if (hydratedParts.length === 0) {
      continue;
    }

    hydratedMessages.push({
      ...message,
      parts: hydratedParts,
    });
  }

  return {
    messages: hydratedMessages,
    stats,
  };
}

function logCachedContentUsage({
  providerMetadata,
  chatId,
  modelId,
}: {
  providerMetadata: ProviderMetadata | undefined;
  chatId: string;
  modelId: ChatModelId;
}) {
  const googleMetadata =
    providerMetadata && typeof providerMetadata === 'object'
      ? (providerMetadata.google as
          | { usageMetadata?: { cachedContentTokenCount?: number | null } }
          | undefined)
      : undefined;
  const cachedContentTokenCount =
    googleMetadata?.usageMetadata?.cachedContentTokenCount;

  if (typeof cachedContentTokenCount === 'number') {
    console.info('Gemini implicit cache usage:', {
      chatId,
      modelId,
      cachedContentTokenCount,
    });
  }
}

async function downloadAssetsForModel(
  requestedDownloads: Array<{ url: URL; isUrlSupportedByModel: boolean }>,
) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  return Promise.all(
    requestedDownloads.map(async (requestedDownload) => {
      if (isGeminiFileUrl(requestedDownload.url.toString())) {
        return null;
      }

      const isVercelBlobUrl = requestedDownload.url.hostname.endsWith(
        '.blob.vercel-storage.com',
      );
      const isPrivateVercelBlobUrl = requestedDownload.url.hostname.endsWith(
        '.private.blob.vercel-storage.com',
      );

      const shouldUseDirectUrlForModel =
        requestedDownload.isUrlSupportedByModel && !isPrivateVercelBlobUrl;

      if (shouldUseDirectUrlForModel) {
        return null;
      }

      const headers: HeadersInit = {};

      if (blobToken && isVercelBlobUrl) {
        headers.authorization = `Bearer ${blobToken}`;
      }

      const response = await fetch(requestedDownload.url, { headers });

      if (!response.ok) {
        throw new Error(
          `Failed to download file for model context (${response.status})`,
        );
      }

      return {
        data: new Uint8Array(await response.arrayBuffer()),
        mediaType: response.headers.get('content-type') ?? undefined,
      };
    }),
  );
}

function extractMessageText(message: UIMessage): string {
  return message.parts
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      }

      return '';
    })
    .join('');
}

type CanonicalUserPart =
  | { type: 'text'; text: string }
  | {
      type: 'file';
      url: string;
      mediaType: string;
      filename: string;
      fileId: string;
    };

function normalizeUserParts(
  parts: unknown,
): Array<{ type: 'text'; text: string } | { type: 'file'; fileId: string }> {
  if (!Array.isArray(parts)) {
    return [];
  }

  const normalized: Array<
    { type: 'text'; text: string } | { type: 'file'; fileId: string }
  > = [];

  for (const part of parts) {
    if (
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      part.type === 'text' &&
      'text' in part &&
      typeof part.text === 'string'
    ) {
      normalized.push({ type: 'text', text: part.text });
      continue;
    }

    if (
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      part.type === 'file' &&
      'fileId' in part &&
      typeof part.fileId === 'string' &&
      UUID_REGEX.test(part.fileId)
    ) {
      normalized.push({ type: 'file', fileId: part.fileId });
    }
  }

  return normalized;
}

async function getCanonicalUserPayload({
  message,
  userId,
  chatId,
}: {
  message: UIMessage;
  userId: string;
  chatId: string;
}) {
  const fileIds: string[] = [];

  for (const part of message.parts) {
    if (part.type !== 'file') {
      continue;
    }

    if (
      !('fileId' in part) ||
      typeof part.fileId !== 'string' ||
      !UUID_REGEX.test(part.fileId)
    ) {
      return { error: INVALID_FILE_ERROR };
    }

    fileIds.push(part.fileId);
  }

  const uniqueFileIds = [...new Set(fileIds)];
  const ownedFiles = await getChatFilesByIdsForUserChat({
    fileIds: uniqueFileIds,
    userId,
    chatId,
  });
  const filesById = new Map(ownedFiles.map((file) => [file.id, file]));

  if (ownedFiles.length !== uniqueFileIds.length) {
    return { error: INVALID_FILE_ERROR };
  }

  const parts: CanonicalUserPart[] = [];

  for (const part of message.parts) {
    if (part.type === 'text') {
      if (typeof part.text !== 'string') {
        return { error: INVALID_USER_MESSAGE_ERROR };
      }

      if (part.text.trim().length === 0) {
        continue;
      }

      parts.push({ type: 'text', text: part.text });
      continue;
    }

    if (
      part.type === 'file' &&
      'fileId' in part &&
      typeof part.fileId === 'string' &&
      UUID_REGEX.test(part.fileId)
    ) {
      const file = filesById.get(part.fileId);

      if (!file) {
        return { error: INVALID_FILE_ERROR };
      }

      parts.push({
        type: 'file',
        url: file.storageUrl,
        mediaType: file.mediaType,
        filename: file.filename,
        fileId: file.id,
      });
      continue;
    }

    if (part.type === 'file') {
      return { error: INVALID_FILE_ERROR };
    }
  }

  if (parts.length === 0) {
    return { error: INVALID_USER_MESSAGE_ERROR };
  }

  const text = parts
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map((part) => part.text)
    .join('');

  return {
    parts,
    uniqueFileIds,
    text,
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let requestBody: PostRequestBody;

  try {
    requestBody = postRequestBodySchema.parse(await request.json());
  } catch (_error) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const { id, selectedChatModel, trigger, messageId } = requestBody;

  if (!isChatModelId(selectedChatModel)) {
    return Response.json(
      { error: `Unknown model: ${selectedChatModel}` },
      { status: 400 },
    );
  }

  const messages = requestBody.messages as UIMessage[];
  const requestedModelId = selectedChatModel as ChatModelId;
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'user');

  if (!lastUserMessage) {
    return Response.json(
      { error: INVALID_USER_MESSAGE_ERROR },
      { status: 400 },
    );
  }

  if (
    trigger === 'submit-message' &&
    messageId &&
    messageId !== lastUserMessage.id
  ) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const canonicalPayload = await getCanonicalUserPayload({
    message: lastUserMessage,
    userId: user.id,
    chatId: id,
  });

  if ('error' in canonicalPayload) {
    return Response.json({ error: canonicalPayload.error }, { status: 400 });
  }
  const canonicalUserParts = canonicalPayload.parts;
  const attachedFileIds = canonicalPayload.uniqueFileIds;
  const userMessageText = canonicalPayload.text;

  // Ensure chat exists — create on first message
  let chat = await getChatById(id);

  if (chat && chat.userId !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!chat) {
    const title =
      extractMessageText(lastUserMessage).slice(0, 100) || 'New Chat';

    chat = await createChat({
      id,
      userId: user.id,
      title,
      modelId: requestedModelId,
    });
  }

  if (chat.title === 'New Chat' && userMessageText.trim().length > 0) {
    await updateChatTitleById({
      chatId: id,
      title: userMessageText.slice(0, 100),
    });
  }

  let activeModelId = requestedModelId;

  if (chat) {
    const storedModelId = resolveChatModelId(chat.modelId);

    if (storedModelId !== requestedModelId) {
      await updateChatModelById({ chatId: id, modelId: requestedModelId });
      activeModelId = requestedModelId;
    } else {
      activeModelId = storedModelId;
    }
  }

  const existingUserMessage = await getMessageByIdAndChatId({
    messageId: lastUserMessage.id,
    chatId: id,
  });

  if (trigger === 'submit-message') {
    if (existingUserMessage) {
      return Response.json({ error: DUPLICATE_MESSAGE_ERROR }, { status: 409 });
    }

    const result = await saveUserMessageWithAttachmentsIfAbsent({
      messageId: lastUserMessage.id,
      chatId: id,
      parts: canonicalUserParts,
      fileIds: attachedFileIds,
    });

    if (!result.inserted) {
      return Response.json({ error: DUPLICATE_MESSAGE_ERROR }, { status: 409 });
    }
  } else {
    if (existingUserMessage) {
      if (existingUserMessage.role !== 'user') {
        return Response.json({ error: CHAT_CONFLICT_ERROR }, { status: 409 });
      }

      const storedNormalized = normalizeUserParts(existingUserMessage.parts);
      const incomingNormalized = normalizeUserParts(canonicalUserParts);

      if (
        JSON.stringify(storedNormalized) !== JSON.stringify(incomingNormalized)
      ) {
        return Response.json({ error: CHAT_CONFLICT_ERROR }, { status: 409 });
      }

      await attachFilesToMessage({
        messageId: lastUserMessage.id,
        chatId: id,
        fileIds: attachedFileIds,
      });
    } else {
      const result = await saveUserMessageWithAttachmentsIfAbsent({
        messageId: lastUserMessage.id,
        chatId: id,
        parts: canonicalUserParts,
        fileIds: attachedFileIds,
      });

      if (!result.inserted) {
        return Response.json({ error: CHAT_CONFLICT_ERROR }, { status: 409 });
      }
    }
  }

  const reservation = await reserveAssistantGenerationSlot({
    userId: user.id,
    dailyLimit: DAILY_ASSISTANT_MESSAGE_LIMIT,
    hoursBack: DAILY_LIMIT_WINDOW_HOURS,
    reservationTtlMinutes: ASSISTANT_RESERVATION_TTL_MINUTES,
  });

  if (!reservation.ok) {
    return Response.json({ error: DAILY_LIMIT_ERROR_MESSAGE }, { status: 429 });
  }

  const reservationId = reservation.reservationId;
  const persistedMessages = await getMessagesByChatId(id);
  const persistedUiMessages: UIMessage[] = persistedMessages.map((message) => ({
    id: message.id,
    role: message.role as UIMessage['role'],
    parts: message.parts as UIMessage['parts'],
    createdAt: message.createdAt,
  }));

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const runtimeContextByModel = new Map<
        ChatModelId,
        Promise<RuntimeHydratedMessages>
      >();
      const getRuntimeContextForModel = (modelId: ChatModelId) => {
        const existing = runtimeContextByModel.get(modelId);
        if (existing) {
          return existing;
        }

        const model = getChatModelById(modelId);
        const runtimeContextPromise = hydrateMessagesForModelContext({
          persistedUiMessages,
          userId: user.id,
          chatId: id,
          preferGeminiUri: model.provider === 'google',
        }).then((context) => {
          console.info('Chat file hydration stats:', {
            chatId: id,
            modelId,
            ...context.stats,
          });
          return context;
        });

        runtimeContextByModel.set(modelId, runtimeContextPromise);
        return runtimeContextPromise;
      };

      const createResultForModel = async (modelId: ChatModelId) => {
        const chatModel = getChatModelById(modelId);
        const model = getLanguageModel(chatModel.id);
        const runtimeContext = await getRuntimeContextForModel(modelId);
        const result = streamText({
          model,
          system: `Ты ${chatModel.name}, ассистент готовый помочь с ежедневными вопросами и задачами.`,
          messages: await convertToModelMessages(runtimeContext.messages),
          tools: {
            google_search: google.tools.googleSearch({}),
          },
          providerOptions: {
            google: { thinkingConfig: chatModel.thinkingConfig },
          },
          experimental_download: downloadAssetsForModel,
        });

        void Promise.resolve(result.providerMetadata)
          .then((providerMetadata) =>
            logCachedContentUsage({
              providerMetadata,
              chatId: id,
              modelId,
            }),
          )
          .catch((error: unknown) => {
            console.error('Failed to read provider metadata:', error);
          });

        return { chatModel, result };
      };

      try {
        const primary = await createResultForModel(activeModelId);
        writer.merge(primary.result.toUIMessageStream());
      } catch (primaryError) {
        const fallbackModelId = getFallbackChatModelId(activeModelId);

        if (fallbackModelId && fallbackModelId !== activeModelId) {
          try {
            const fallback = await createResultForModel(fallbackModelId);
            console.error(
              `Primary model unavailable (${activeModelId}); falling back to ${fallbackModelId}:`,
              primaryError,
            );
            writer.merge(fallback.result.toUIMessageStream());
            return;
          } catch (fallbackError) {
            console.error(
              `Fallback model unavailable (${fallbackModelId}) after primary failure (${activeModelId}):`,
              fallbackError,
            );
          }
        } else {
          console.error(
            `Stream error for model ${activeModelId}:`,
            primaryError,
          );
        }

        const chatModel = getChatModelById(activeModelId);
        await releaseAssistantGenerationSlot(reservationId);
        writer.write({
          type: 'error',
          errorText: `Модель ${chatModel.name} сейчас недоступна. Попробуйте выбрать другую модель.`,
        });
      }
    },
    onFinish: async ({ responseMessage }) => {
      try {
        if (responseMessage.role === 'assistant') {
          await saveMessages([
            {
              id: responseMessage.id,
              chatId: id,
              role: responseMessage.role,
              parts: responseMessage.parts as unknown[],
            },
          ]);
        }
      } finally {
        await releaseAssistantGenerationSlot(reservationId);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('id');

  if (!chatId) {
    return Response.json({ error: 'Missing chat id' }, { status: 400 });
  }

  const chat = await getChatById(chatId);

  if (!chat || chat.userId !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const files = await getChatFilesByChatId(chatId);

  if (files.length > 0) {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

    if (!blobToken) {
      return Response.json(
        {
          error:
            'Удаление файлов недоступно: отсутствует BLOB_READ_WRITE_TOKEN.',
        },
        { status: 500 },
      );
    }

    for (const file of files) {
      try {
        await del(file.storageKey, { token: blobToken });
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          continue;
        }

        console.error('Blob cleanup failed:', error);
        return Response.json(
          { error: 'Не удалось удалить файлы чата. Попробуйте снова.' },
          { status: 500 },
        );
      }
    }

    const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (geminiApiKey) {
      for (const file of files) {
        if (!file.geminiFileUri) {
          continue;
        }

        try {
          await deleteGeminiFile({
            fileNameOrUri: file.geminiFileUri,
            apiKey: geminiApiKey,
            timeoutMs: GEMINI_FILES_UPLOAD_TIMEOUT,
          });
        } catch (error) {
          console.error('Gemini file cleanup failed (non-blocking):', {
            fileId: file.id,
            error,
          });
        }
      }
    }
  }

  await deleteChatById(chatId);

  return Response.json({ success: true });
}
