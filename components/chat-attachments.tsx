'use client';

import { File, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DOCX_MEDIA_TYPE } from '@/lib/uploads';

type Attachment = {
  fileId: string | null;
  filename: string;
  mediaType: string;
  src?: string | null;
};

type PendingAttachment = {
  fileId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  previewUrl?: string;
};

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RemoveAttachmentButton({
  filename,
  onRemove,
}: {
  filename: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Удалить вложение «${filename}»`}
      title="Удалить вложение"
      className="absolute -top-1.5 -right-1.5 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-foreground text-background shadow-sm transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <X className="size-3.5" strokeWidth={2} />
    </button>
  );
}

function DocumentAttachment({
  filename,
  mediaType,
  sizeBytes,
  onRemove,
}: {
  filename: string;
  mediaType: string;
  sizeBytes?: number;
  onRemove?: () => void;
}) {
  const fileType =
    mediaType === 'application/pdf'
      ? 'PDF'
      : mediaType === DOCX_MEDIA_TYPE
        ? 'DOCX'
        : mediaType === 'text/plain'
          ? 'TXT'
          : 'Файл';

  return (
    <div
      className="relative flex min-h-[60px] w-80 max-w-full items-center gap-3 rounded-[18px] border border-input bg-[var(--composer)] px-4 py-2.5"
      title={
        sizeBytes === undefined
          ? filename
          : `${filename} · ${formatFileSize(sizeBytes)}`
      }
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex w-7 shrink-0 flex-col items-center gap-0.5',
          fileType === 'PDF'
            ? 'text-[#e53935] dark:text-[#ff453a]'
            : 'text-muted-foreground',
        )}
      >
        <File className="size-5" strokeWidth={1.8} />
        <span className="text-[8px] leading-none font-semibold">
          {fileType}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium">{filename}</p>
        <p className="text-sm leading-5 text-muted-foreground">{fileType}</p>
      </div>
      {onRemove && (
        <RemoveAttachmentButton filename={filename} onRemove={onRemove} />
      )}
    </div>
  );
}

export function MessageAttachments({
  files,
  align = 'end',
  className,
}: {
  files: Attachment[];
  align?: 'start' | 'end';
  className?: string;
}) {
  const imageCount = files.filter(
    (file) => file.mediaType?.startsWith('image/') && file.src,
  ).length;

  return (
    <div
      role="group"
      aria-label="Вложения сообщения"
      className={cn(
        'flex w-fit max-w-full flex-wrap gap-1.5',
        align === 'end' ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      {files.map((file, index) =>
        file.mediaType?.startsWith('image/') && file.src ? (
          <a
            key={file.fileId ?? `${file.filename}-${index}`}
            href={file.src}
            target="_blank"
            rel="noreferrer"
            title={file.filename}
            aria-label={`Открыть изображение «${file.filename}»`}
            className={cn(
              'block overflow-hidden bg-muted transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              imageCount === 1
                ? 'max-w-[min(100%,22rem)] rounded-3xl'
                : 'size-32 max-w-full rounded-2xl',
            )}
          >
            {/* User-owned Blob/object URLs use the existing authenticated image path. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.src}
              alt={file.filename}
              className={
                imageCount === 1
                  ? 'block max-h-[25rem] max-w-full h-auto w-auto object-contain'
                  : 'size-full object-cover'
              }
            />
          </a>
        ) : (
          <div
            key={file.fileId ?? `${file.filename}-${index}`}
            className={cn(
              'flex w-full',
              align === 'end' ? 'justify-end' : 'justify-start',
            )}
          >
            <DocumentAttachment
              filename={file.filename}
              mediaType={file.mediaType}
            />
          </div>
        ),
      )}
    </div>
  );
}

export function ComposerAttachments({
  files,
  onRemove,
}: {
  files: PendingAttachment[];
  onRemove: (fileId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Прикреплённые файлы"
      className="flex max-h-60 flex-wrap gap-3 overflow-y-auto px-1.5 pt-2 pb-4"
    >
      {files.map((file) =>
        file.previewUrl ? (
          <div key={file.fileId} className="relative size-24 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img
              src={file.previewUrl}
              alt={file.filename}
              className="size-full rounded-2xl object-cover"
            />
            <RemoveAttachmentButton
              filename={file.filename}
              onRemove={() => onRemove(file.fileId)}
            />
          </div>
        ) : (
          <DocumentAttachment
            key={file.fileId}
            filename={file.filename}
            mediaType={file.mediaType}
            sizeBytes={file.sizeBytes}
            onRemove={() => onRemove(file.fileId)}
          />
        ),
      )}
    </div>
  );
}
