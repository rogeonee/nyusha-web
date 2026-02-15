import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import { getCurrentUser } from '@/lib/auth/session';
import {
  createChat,
  deleteChatById,
  getChatById,
  saveMessages,
} from '@/lib/db/queries';

export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, messages }: { id: string; messages: UIMessage[] } =
    await request.json();

  // Ensure chat exists — create on first message
  const existingChat = await getChatById(id);

  if (!existingChat) {
    const firstUserMessage = messages.find((m) => m.role === 'user');
    const title = firstUserMessage
      ? firstUserMessage.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('')
          .slice(0, 100) || 'New Chat'
      : 'New Chat';

    await createChat({ id, userId: user.id, title });
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

  const model = google('gemini-2.5-flash') as unknown as LanguageModel;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model,
        system:
          'Ты Gemini 2.5 Flash, ассистент готовый помочь с ежедневными вопросами и задачами.',
        messages: await convertToModelMessages(messages),
      });

      writer.merge(result.toUIMessageStream());
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
