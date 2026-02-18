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
  getMessageCountByUserId,
  saveMessages,
  updateChatModelById,
} from '@/lib/db/queries';
import { type PostRequestBody, postRequestBodySchema } from './schema';

export const maxDuration = 90;

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

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const DAILY_MESSAGE_LIMIT = 200;
  const messageCount = await getMessageCountByUserId(user.id, 24);
  if (messageCount >= DAILY_MESSAGE_LIMIT) {
    return Response.json(
      { error: 'Вы достигли дневного лимита сообщений. Попробуйте завтра.' },
      { status: 429 },
    );
  }

  let requestBody: PostRequestBody;

  try {
    requestBody = postRequestBodySchema.parse(await request.json());
  } catch (_error) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const { id, selectedChatModel } = requestBody;

  if (!isChatModelId(selectedChatModel)) {
    return Response.json(
      { error: `Unknown model: ${selectedChatModel}` },
      { status: 400 },
    );
  }

  const messages = requestBody.messages as UIMessage[];
  const requestedModelId = selectedChatModel as ChatModelId;

  // Ensure chat exists — create on first message
  const existingChat = await getChatById(id);

  if (existingChat && existingChat.userId !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!existingChat) {
    const firstUserMessage = messages.find((m) => m.role === 'user');
    const title = firstUserMessage
      ? extractMessageText(firstUserMessage).slice(0, 100) || 'New Chat'
      : 'New Chat';

    await createChat({ id, userId: user.id, title, modelId: requestedModelId });
  }

  let activeModelId = requestedModelId;

  if (existingChat) {
    const storedModelId = resolveChatModelId(existingChat.modelId);

    if (storedModelId !== requestedModelId) {
      await updateChatModelById({ chatId: id, modelId: requestedModelId });
      activeModelId = requestedModelId;
    } else {
      activeModelId = storedModelId;
    }
  }

  // Save the latest user message
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'user');

  if (lastUserMessage) {
    await saveMessages([
      {
        id: lastUserMessage.id,
        chatId: id,
        role: lastUserMessage.role,
        parts: lastUserMessage.parts,
      },
    ]);
  }

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
            messages: await convertToModelMessages(messages),
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
        writer.write({
          type: 'error',
          errorText: `Модель ${chatModel.name} сейчас недоступна. Попробуйте выбрать другую модель.`,
        });
      }
    },
    onFinish: async ({ responseMessage }) => {
      await saveMessages([
        {
          id: responseMessage.id,
          chatId: id,
          role: responseMessage.role,
          parts: responseMessage.parts as unknown[],
        },
      ]);
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
