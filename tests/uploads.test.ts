import { describe, expect, it } from 'vitest';
import {
  isUploadPathOwnedByChat,
  sanitizeUploadFilename,
  uploadPathMatchesFilename,
} from '@/lib/uploads';

const CHAT_ID = '00000000-0000-4000-8000-000000000000';

describe('upload path validation', () => {
  it('accepts repeated dots inside a filename', () => {
    const pathname = `${CHAT_ID}/123-upload-report..pdf`;

    expect(isUploadPathOwnedByChat(pathname, CHAT_ID)).toBe(true);
    expect(uploadPathMatchesFilename(pathname, 'report..pdf')).toBe(true);
  });

  it.each([
    `${CHAT_ID}/../report.pdf`,
    `${CHAT_ID}/..`,
    `${CHAT_ID}/nested/report.pdf`,
    `${CHAT_ID}\\report.pdf`,
    `00000000-0000-4000-8000-000000000001/report.pdf`,
  ])('rejects a path outside the chat file segment: %s', (pathname) => {
    expect(isUploadPathOwnedByChat(pathname, CHAT_ID)).toBe(false);
  });

  it('requires the path suffix to match the sanitized filename', () => {
    const pathname = `${CHAT_ID}/123-upload-family-report.pdf`;

    expect(uploadPathMatchesFilename(pathname, 'family report.pdf')).toBe(true);
    expect(uploadPathMatchesFilename(pathname, 'other.pdf')).toBe(false);
  });

  it('uses the same filename sanitization for client and server checks', () => {
    expect(sanitizeUploadFilename('  family  report..pdf  ')).toBe(
      'family-report..pdf',
    );
  });
});
