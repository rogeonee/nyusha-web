import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  streamText,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import { getCurrentUser } from '@/lib/auth/session';

export const maxDuration = 90;

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await request.json();
  // Direct Google provider expects a raw Gemini model ID (no `google/` prefix).
  const model = google('gemini-2.5-flash') as unknown as LanguageModel;

  const result = streamText({
    model,
    system:
      'Ты Gemini 2.5 Flash, ассистент готовый помочь с ежедневными вопросами и задачами.',
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
