import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from 'ai';
import { google } from '@ai-sdk/google';
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
  createChat,
  deleteChatById,
  getChatById,
  getMessageByIdAndChatId,
  getMessagesByChatId,
  releaseAssistantGenerationSlot,
  reserveAssistantGenerationSlot,
  saveMessageIfAbsent,
  saveMessages,
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

function extractTextFromStoredParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((part) => {
      if (
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        'text' in part &&
        part.type === 'text' &&
        typeof part.text === 'string'
      ) {
        return part.text;
      }

      return '';
    })
    .join('');
}

function getCanonicalUserParts(message: UIMessage) {
  const text = extractMessageText(message);

  if (!text.trim()) {
    return null;
  }

  return [{ type: 'text' as const, text }];
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

  const canonicalUserParts = getCanonicalUserParts(lastUserMessage);

  if (!canonicalUserParts) {
    return Response.json(
      { error: INVALID_USER_MESSAGE_ERROR },
      { status: 400 },
    );
  }

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

    const inserted = await saveMessageIfAbsent({
      id: lastUserMessage.id,
      chatId: id,
      role: 'user',
      parts: canonicalUserParts,
    });

    if (!inserted) {
      return Response.json({ error: DUPLICATE_MESSAGE_ERROR }, { status: 409 });
    }
  } else {
    if (existingUserMessage) {
      if (existingUserMessage.role !== 'user') {
        return Response.json({ error: CHAT_CONFLICT_ERROR }, { status: 409 });
      }

      const storedText = extractTextFromStoredParts(existingUserMessage.parts);
      const incomingText = canonicalUserParts.map((part) => part.text).join('');

      if (storedText !== incomingText) {
        return Response.json({ error: CHAT_CONFLICT_ERROR }, { status: 409 });
      }
    } else {
      const inserted = await saveMessageIfAbsent({
        id: lastUserMessage.id,
        chatId: id,
        role: 'user',
        parts: canonicalUserParts,
      });

      if (!inserted) {
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

  await deleteChatById(chatId);

  return Response.json({ success: true });
}
