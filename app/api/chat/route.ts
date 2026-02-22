import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from 'ai';
import { google } from '@ai-sdk/google';
import { BlobNotFoundError, del } from '@vercel/blob';
import {
  getChatModelById,
  getFallbackChatModelId,
  isChatModelId,
  resolveChatModelId,
  type ChatModelId,
} from '@/lib/ai/models';
import { getLanguageModel } from '@/lib/ai/providers';
import { getCurrentUser } from '@/lib/auth/session';
import {
  attachFilesToMessage,
  createChat,
  deleteChatById,
  getChatById,
  getChatFilesByChatId,
  getChatFilesByIdsForUserChat,
  getMessageByIdAndChatId,
  getMessagesByChatId,
  releaseAssistantGenerationSlot,
  reserveAssistantGenerationSlot,
  saveMessages,
  saveUserMessageWithAttachmentsIfAbsent,
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

function isBlobNotFoundError(error: unknown) {
  if (error instanceof BlobNotFoundError) {
    return true;
  }

  if (typeof error === 'object' && error !== null && 'name' in error) {
    return error.name === 'BlobNotFoundError';
  }

  return false;
}

async function downloadAssetsForModel(
  requestedDownloads: Array<{ url: URL; isUrlSupportedByModel: boolean }>,
) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  return Promise.all(
    requestedDownloads.map(async (requestedDownload) => {
      if (requestedDownload.isUrlSupportedByModel) {
        return null;
      }

      const headers: HeadersInit = {};
      const isVercelBlobUrl = requestedDownload.url.hostname.endsWith(
        '.blob.vercel-storage.com',
      );

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
  const now = new Date();
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
        url:
          file.geminiFileUri &&
          file.geminiFileExpiresAt &&
          file.geminiFileExpiresAt > now
            ? file.geminiFileUri
            : file.storageUrl,
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
      const createResultForModel = async (modelId: ChatModelId) => {
        const chatModel = getChatModelById(modelId);
        const model = getLanguageModel(chatModel.id);

        return {
          chatModel,
          result: streamText({
            model,
            system: `Ты ${chatModel.name}, ассистент готовый помочь с ежедневными вопросами и задачами.`,
            messages: await convertToModelMessages(persistedUiMessages),
            tools: {
              google_search: google.tools.googleSearch({}),
            },
            providerOptions: {
              google: { thinkingConfig: chatModel.thinkingConfig },
            },
            experimental_download: downloadAssetsForModel,
          }),
        };
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
        if (isBlobNotFoundError(error)) {
          continue;
        }

        console.error('Blob cleanup failed:', error);
        return Response.json(
          { error: 'Не удалось удалить файлы чата. Попробуйте снова.' },
          { status: 500 },
        );
      }
    }
  }

  await deleteChatById(chatId);

  return Response.json({ success: true });
}
