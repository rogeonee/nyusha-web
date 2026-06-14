import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { getChatFileByIdForUser } from '@/lib/db/queries';

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = paramsSchema.safeParse(await params);

  if (!parsed.success) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const file = await getChatFileByIdForUser({
    fileId: parsed.data.id,
    userId: user.id,
  });

  if (!file) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const headers: HeadersInit = {};
  const storageHost = new URL(file.storageUrl).hostname;

  if (storageHost.endsWith('.blob.vercel-storage.com') && blobToken) {
    headers.authorization = `Bearer ${blobToken}`;
  }

  const upstream = await fetch(file.storageUrl, { headers });

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: 'Upstream fetch failed' }, { status: 502 });
  }

  const asciiFilename = file.filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const responseHeaders: Record<string, string> = {
    'content-type': file.mediaType,
    'x-content-type-options': 'nosniff',
    'content-disposition': `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    // private to the authenticated owner; safe to cache in the browser
    'cache-control': 'private, max-age=3600',
  };
  const upstreamLength = upstream.headers.get('content-length');

  if (upstreamLength) {
    responseHeaders['content-length'] = upstreamLength;
  }

  return new Response(upstream.body, { headers: responseHeaders });
}
