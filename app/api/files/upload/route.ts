import { BlobNotFoundError, del, head } from '@vercel/blob';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import {
  createChatFile,
  getChatById,
  getChatFileByStorageKeyForUserChat,
} from '@/lib/db/queries';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = [
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
] as const;
const finalizeUploadSchema = z.object({
  chatId: z.uuid(),
  pathname: z
    .string()
    .trim()
    .min(1, 'Некорректный путь файла.')
    .max(512, 'Некорректный путь файла.'),
  filename: z.string().trim().min(1).max(255).optional(),
});

function isPathnameOwnedByChat(pathname: string, chatId: string) {
  return (
    pathname.startsWith(`${chatId}/`) &&
    !pathname.includes('..') &&
    !pathname.includes('\\')
  );
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

function isStorageKeyUniqueConflict(error: unknown) {
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
  const constraint =
    'constraint' in cause && typeof cause.constraint === 'string'
      ? cause.constraint
      : '';
  const detail = 'detail' in cause ? String(cause.detail) : '';
  const message = 'message' in cause ? String(cause.message) : '';

  if (code !== '23505') {
    return false;
  }

  if (constraint === 'chat_files_storage_key_unique_idx') {
    return true;
  }

  return (
    detail.includes('(storage_key)') ||
    message.includes('chat_files_storage_key_unique_idx')
  );
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

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = finalizeUploadSchema.safeParse(payload);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Bad request';
    return Response.json({ error: message }, { status: 400 });
  }

  const { chatId, pathname, filename: requestedFilename } = parsed.data;
  const uploadedFileName = requestedFilename?.trim() || 'upload.bin';

  const chat = await getChatById(chatId);

  if (!chat || chat.userId !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (!isPathnameOwnedByChat(pathname, chatId)) {
    return Response.json(
      { error: 'Некорректный путь файла для этого чата.' },
      { status: 400 },
    );
  }

  try {
    const blob = await head(pathname, { token: blobToken });

    if (blob.size <= 0) {
      return Response.json({ error: 'Файл пустой.' }, { status: 400 });
    }

    if (blob.size > MAX_UPLOAD_SIZE_BYTES) {
      return Response.json(
        {
          error: `Размер файла не должен превышать ${Math.floor(
            MAX_UPLOAD_SIZE_BYTES / 1024 / 1024,
          )} MB.`,
        },
        { status: 400 },
      );
    }

    if (
      !ALLOWED_MEDIA_TYPES.includes(
        blob.contentType as (typeof ALLOWED_MEDIA_TYPES)[number],
      )
    ) {
      return Response.json(
        { error: 'Неподдерживаемый тип файла.' },
        { status: 400 },
      );
    }

    const canonicalName = uploadedFileName;

    let chatFile: Awaited<ReturnType<typeof createChatFile>>;

    try {
      chatFile = await createChatFile({
        chatId,
        userId: user.id,
        filename: canonicalName,
        mediaType: blob.contentType,
        sizeBytes: blob.size,
        storageProvider: 'vercel_blob',
        storageKey: pathname,
        storageUrl: blob.url,
        status: 'uploaded',
      });
    } catch (dbError) {
      if (isStorageKeyUniqueConflict(dbError)) {
        const existingFile = await getChatFileByStorageKeyForUserChat({
          storageKey: pathname,
          userId: user.id,
          chatId,
        });

        if (existingFile) {
          return Response.json({
            fileId: existingFile.id,
            filename: existingFile.filename,
            mediaType: existingFile.mediaType,
            sizeBytes: existingFile.sizeBytes,
          });
        }

        return Response.json({ error: 'Upload conflict' }, { status: 409 });
      }

      try {
        await del(pathname, { token: blobToken });
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
    if (error instanceof BlobNotFoundError) {
      return Response.json({ error: 'Файл не найден.' }, { status: 404 });
    }
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
