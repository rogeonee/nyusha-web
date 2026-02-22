import { randomUUID } from 'crypto';
import { del, put } from '@vercel/blob';
import { z } from 'zod';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { getCurrentUser } from '@/lib/auth/session';
import {
  createChatIfAbsent,
  createChatFile,
  getChatById,
} from '@/lib/db/queries';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
type BlobAccessMode = 'private' | 'public';
const ALLOWED_MEDIA_TYPES = [
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
] as const;
const BLOB_ACCESS: BlobAccessMode =
  process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';

const uploadSchema = z.object({
  chatId: z.uuid(),
  file: z
    .instanceof(Blob)
    .refine((file) => file.size > 0, 'Файл пустой.')
    .refine(
      (file) => file.size <= MAX_UPLOAD_SIZE_BYTES,
      `Размер файла не должен превышать ${Math.floor(
        MAX_UPLOAD_SIZE_BYTES / 1024 / 1024,
      )} MB.`,
    )
    .refine(
      (file) =>
        ALLOWED_MEDIA_TYPES.includes(
          file.type as (typeof ALLOWED_MEDIA_TYPES)[number],
        ),
      'Неподдерживаемый тип файла.',
    ),
});

function sanitizeFilename(value: string) {
  const normalized = value.trim().replace(/\s+/g, '-');
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]/g, '-');
  const collapsed = cleaned.replace(/-+/g, '-');
  const clipped = collapsed.slice(0, 120);

  return clipped.length > 0 ? clipped : 'file';
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

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const cause =
    'cause' in error && typeof error.cause === 'object' && error.cause !== null
      ? error.cause
      : null;

  if (!cause) {
    return false;
  }

  const code = 'code' in cause ? String(cause.code) : '';
  const message = 'message' in cause ? String(cause.message) : '';

  return code === '42P01' && message.includes('chat_files');
}

async function putWithCompatibleAccess({
  storageKey,
  file,
  blobToken,
}: {
  storageKey: string;
  file: Blob;
  blobToken: string;
}) {
  const attemptedAccess = BLOB_ACCESS;

  try {
    const blob = await put(storageKey, file, {
      access: attemptedAccess,
      addRandomSuffix: false,
      token: blobToken,
    });

    return blob;
  } catch (error) {
    if (!isAccessModeMismatchError(error, attemptedAccess)) {
      throw error;
    }

    const fallbackAccess: BlobAccessMode =
      attemptedAccess === 'private' ? 'public' : 'private';

    return put(storageKey, file, {
      access: fallbackAccess,
      addRandomSuffix: false,
      token: blobToken,
    });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse({
    chatId: formData.get('chatId'),
    file: formData.get('file'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Bad request';
    return Response.json({ error: message }, { status: 400 });
  }

  const { chatId, file } = parsed.data;
  const uploadedFileName =
    formData.get('file') instanceof File
      ? (formData.get('file') as File).name
      : 'upload.bin';

  let chat = await getChatById(chatId);

  if (chat && chat.userId !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!chat) {
    chat = await createChatIfAbsent({
      id: chatId,
      userId: user.id,
      title: 'New Chat',
      modelId: DEFAULT_CHAT_MODEL,
    });

    if (!chat || chat.userId !== user.id) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const safeName = sanitizeFilename(uploadedFileName);
  const storageKey = `${chatId}/${Date.now()}-${randomUUID()}-${safeName}`;

  try {
    const blob = await putWithCompatibleAccess({
      storageKey,
      file,
      blobToken,
    });

    let chatFile: Awaited<ReturnType<typeof createChatFile>>;

    try {
      chatFile = await createChatFile({
        chatId,
        userId: user.id,
        filename: uploadedFileName,
        mediaType: file.type,
        sizeBytes: file.size,
        storageProvider: 'vercel_blob',
        storageKey: blob.pathname,
        storageUrl: blob.url,
        status: 'uploaded',
      });
    } catch (dbError) {
      try {
        await del(blob.pathname, { token: blobToken });
      } catch (cleanupError) {
        console.error('Upload rollback blob cleanup failed:', cleanupError);
      }

      throw dbError;
    }

    return Response.json({
      fileId: chatFile.id,
      filename: chatFile.filename,
      mediaType: chatFile.mediaType,
      sizeBytes: chatFile.sizeBytes,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    if (isMissingTableError(error)) {
      return Response.json(
        {
          error:
            'Таблицы загрузок не найдены в базе данных. Выполните миграции (pnpm db:migrate) для текущего окружения.',
        },
        { status: 500 },
      );
    }
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
