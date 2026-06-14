export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const MAX_FILENAME_LENGTH = 255;

export const ALLOWED_MEDIA_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
] as const;

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export const DOCX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' satisfies AllowedMediaType;

export function isAllowedMediaType(type: string): type is AllowedMediaType {
  return ALLOWED_MEDIA_TYPES.includes(type as AllowedMediaType);
}

export function sanitizeUploadFilename(value: string) {
  const normalized = value.trim().replace(/\s+/g, '-');
  const cleaned = normalized.replace(/[^a-zA-Z0-9._-]/g, '-');
  const collapsed = cleaned.replace(/-+/g, '-');
  const clipped = collapsed.slice(0, 120);

  return clipped.length > 0 ? clipped : 'file';
}

export function isUploadPathOwnedByChat(pathname: string, chatId: string) {
  const segments = pathname.split('/');

  return (
    segments.length === 2 &&
    segments[0] === chatId &&
    segments[1].length > 0 &&
    segments[1] !== '.' &&
    segments[1] !== '..' &&
    !pathname.includes('\\')
  );
}

export function uploadPathMatchesFilename(
  pathname: string,
  filename: string,
) {
  const basename = pathname.split('/').pop() ?? '';
  const sanitizedFilename = sanitizeUploadFilename(filename);

  return (
    basename === sanitizedFilename || basename.endsWith(`-${sanitizedFilename}`)
  );
}

// Canonical type per supported file extension. The extension is the
// authoritative signal for an upload's type (see `resolveMediaType`).
const EXTENSION_MEDIA_TYPES: Record<string, AllowedMediaType> = {
  pdf: 'application/pdf',
  docx: DOCX_MEDIA_TYPE,
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/**
 * Resolve the canonical allowed media type from the filename extension, or null
 * for unsupported files.
 *
 * The extension is authoritative and the browser-reported `File.type` is
 * deliberately ignored: it is untrusted, varies by OS (Windows reports PDFs as
 * `application/x-pdf` or empty), and drag-and-drop bypasses the file picker's
 * extension filter. Trusting it could persist a `.pdf` mislabeled `image/png`
 * as an image, or accept a `.exe` labeled `application/pdf`. Resolving by
 * extension also keeps PDFs uploadable regardless of how the user's OS labels them.
 */
export function resolveMediaType(filename: string): AllowedMediaType | null {
  return EXTENSION_MEDIA_TYPES[extensionOf(filename)] ?? null;
}
