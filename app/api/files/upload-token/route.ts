import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { z } from 'zod';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { getCurrentUser } from '@/lib/auth/session';
import { createChatIfAbsent, getChatById } from '@/lib/db/queries';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = [
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
] as const;

const uploadEventSchema = z.object({
  type: z.enum(['blob.generate-client-token', 'blob.upload-completed']),
});

const clientPayloadSchema = z.object({
  chatId: z.uuid(),
  filename: z
    .string()
    .trim()
    .min(1, 'Некорректное имя файла.')
    .max(255, 'Некорректное имя файла.'),
  mediaType: z.string().trim().min(1).max(255).optional(),
});

function sanitizeFilename(value: string) {
  const normalized = value.trim().replace(/\s+/g, '-');
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]/g, '-');
  const collapsed = cleaned.replace(/-+/g, '-');
  const clipped = collapsed.slice(0, 120);

  return clipped.length > 0 ? clipped : 'file';
}

function isPathnameOwnedByChat(pathname: string, chatId: string) {
  return (
    pathname.startsWith(`${chatId}/`) &&
    !pathname.includes('..') &&
    !pathname.includes('\\')
  );
}

function pathnameMatchesFilename(pathname: string, filename: string) {
  const basename = pathname.split('/').pop() ?? '';
  const sanitizedFilename = sanitizeFilename(filename);

  return (
    basename === sanitizedFilename || basename.endsWith(`-${sanitizedFilename}`)
  );
}

function parseClientPayload(clientPayload: string | null) {
  if (!clientPayload) {
    throw new Error('Missing client payload.');
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(clientPayload);
  } catch {
    throw new Error('Invalid client payload JSON.');
  }

  const parsed = clientPayloadSchema.safeParse(parsedPayload);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? 'Invalid client payload.',
    );
  }

  return parsed.data;
}

export async function POST(request: Request) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!blobToken) {
    return Response.json(
      {
        error:
          'Загрузка файлов временно отключена: отсутствует BLOB_READ_WRITE_TOKEN.',
      },
      { status: 503 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const event = uploadEventSchema.safeParse(body);

  if (!event.success) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const isGenerateClientTokenEvent =
    event.data.type === 'blob.generate-client-token';
  const user = isGenerateClientTokenEvent ? await getCurrentUser() : null;

  if (isGenerateClientTokenEvent && !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const jsonResponse = await handleUpload({
      token: blobToken,
      request,
      body: body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!user) {
          throw new Error('Unauthorized');
        }

        const payload = parseClientPayload(clientPayload);

        if (
          payload.mediaType &&
          !ALLOWED_MEDIA_TYPES.includes(
            payload.mediaType as (typeof ALLOWED_MEDIA_TYPES)[number],
          )
        ) {
          throw new Error('Неподдерживаемый тип файла.');
        }

        let chat = await getChatById(payload.chatId);

        if (chat && chat.userId !== user.id) {
          throw new Error('Not found');
        }

        if (!chat) {
          chat = await createChatIfAbsent({
            id: payload.chatId,
            userId: user.id,
            title: 'New Chat',
            modelId: DEFAULT_CHAT_MODEL,
          });
        }

        if (!chat || chat.userId !== user.id) {
          throw new Error('Not found');
        }

        if (!isPathnameOwnedByChat(pathname, payload.chatId)) {
          throw new Error('Некорректный путь файла для этого чата.');
        }

        if (!pathnameMatchesFilename(pathname, payload.filename)) {
          throw new Error('Некорректное имя файла в пути загрузки.');
        }

        return {
          allowedContentTypes: [...ALLOWED_MEDIA_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_SIZE_BYTES,
          addRandomSuffix: false,
          validUntil: Date.now() + 15 * 60 * 1000,
          tokenPayload: JSON.stringify({
            chatId: payload.chatId,
            userId: user.id,
          }),
        };
      },
      onUploadCompleted: async () => {},
    });

    return Response.json(jsonResponse);
  } catch (error) {
    console.error('Upload token failed:', error);
    const message =
      error instanceof Error ? error.message : 'Upload token failed';
    const status =
      message === 'Unauthorized'
        ? 401
        : message === 'Not found'
        ? 404
        : message === 'Неподдерживаемый тип файла.' ||
          message === 'Некорректный путь файла для этого чата.' ||
          message === 'Некорректное имя файла в пути загрузки.' ||
          message === 'Missing client payload.' ||
          message === 'Invalid client payload JSON.' ||
          message === 'Некорректное имя файла.'
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
