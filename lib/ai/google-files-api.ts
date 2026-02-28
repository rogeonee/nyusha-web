const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_BASE =
  'https://generativelanguage.googleapis.com/upload/v1beta/files';
const DEFAULT_RETRIES = 2;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

class GeminiApiHttpError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = 'GeminiApiHttpError';
    this.status = status;
    this.retryable = retryable;
  }
}

type GeminiFileApiResponse = {
  name?: string;
  uri?: string;
  mimeType?: string;
  expirationTime?: string;
  state?: string | { name?: string };
};

export type ParsedGeminiFileRef = {
  fileName: string;
  fileUri: string;
};

export type GeminiFileRecord = {
  name: string;
  uri: string;
  mimeType: string;
  expiresAt: Date | null;
  state: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toGeminiFileRecord(payload: unknown): GeminiFileRecord {
  const raw = payload as Record<string, unknown> | null;
  const wrapped =
    raw && typeof raw.file === 'object' && raw.file !== null
      ? (raw.file as GeminiFileApiResponse)
      : (raw as unknown as GeminiFileApiResponse);

  if (!wrapped?.name || !wrapped.uri || !wrapped.mimeType) {
    throw new Error('Gemini Files API returned incomplete file metadata.');
  }

  const state =
    typeof wrapped.state === 'string'
      ? wrapped.state
      : wrapped.state && typeof wrapped.state.name === 'string'
      ? wrapped.state.name
      : null;

  return {
    name: wrapped.name,
    uri: wrapped.uri,
    mimeType: wrapped.mimeType,
    expiresAt: wrapped.expirationTime ? new Date(wrapped.expirationTime) : null,
    state,
  };
}

function shouldRetryResponse(status: number) {
  return status === 429 || status >= 500;
}

function parseErrorMessage(payload: unknown, fallback: string) {
  const raw = payload as Record<string, unknown> | null;
  const err =
    raw && typeof raw.error === 'object'
      ? (raw.error as Record<string, unknown>)
      : null;
  const message = err && typeof err.message === 'string' ? err.message : '';
  return message.length > 0 ? message : fallback;
}

async function fetchJsonWithRetry({
  url,
  timeoutMs,
  retries = DEFAULT_RETRIES,
  buildInit,
}: {
  url: string;
  timeoutMs: number;
  retries?: number;
  buildInit: () => RequestInit;
}) {
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...buildInit(),
        signal: controller.signal,
      });

      let payload: unknown = null;
      const responseText = await response.text();
      if (responseText.length > 0) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = responseText;
        }
      }

      if (!response.ok) {
        const message = parseErrorMessage(
          payload,
          `Gemini Files API request failed with status ${response.status}.`,
        );
        const retryable = shouldRetryResponse(response.status);
        const error = new GeminiApiHttpError(
          message,
          response.status,
          retryable,
        );

        if (attempt < retries && retryable) {
          attempt += 1;
          await sleep(300 * 2 ** (attempt - 1));
          continue;
        }

        throw error;
      }

      return payload;
    } catch (error) {
      if (error instanceof GeminiApiHttpError && !error.retryable) {
        throw error;
      }

      if (attempt >= retries) {
        throw error;
      }

      attempt += 1;
      await sleep(300 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Gemini Files API request failed.');
}

async function fetchRawWithRetry({
  url,
  timeoutMs,
  retries = DEFAULT_RETRIES,
  buildInit,
}: {
  url: string;
  timeoutMs: number;
  retries?: number;
  buildInit: () => RequestInit;
}) {
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...buildInit(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = shouldRetryResponse(response.status);

        if (attempt < retries && retryable) {
          attempt += 1;
          await sleep(300 * 2 ** (attempt - 1));
          continue;
        }

        const text = await response.text();
        throw new GeminiApiHttpError(
          text ||
            `Gemini Files API request failed with status ${response.status}.`,
          response.status,
          retryable,
        );
      }

      return response;
    } catch (error) {
      if (error instanceof GeminiApiHttpError && !error.retryable) {
        throw error;
      }

      if (attempt >= retries) {
        throw error;
      }

      attempt += 1;
      await sleep(300 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Gemini Files API request failed.');
}

export function parseGeminiFileRef(input: string): ParsedGeminiFileRef {
  const value = input.trim();

  if (value.length === 0) {
    throw new Error('Invalid Gemini file reference.');
  }

  if (value.startsWith('files/')) {
    return {
      fileName: value,
      fileUri: `${GEMINI_API_BASE}/${value}`,
    };
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    const url = new URL(value);
    const match = url.pathname.match(/\/v1beta\/(files\/[^/]+)$/);

    if (!match?.[1]) {
      throw new Error('Invalid Gemini file URI.');
    }

    const fileName = match[1];

    return {
      fileName,
      fileUri: `${GEMINI_API_BASE}/${fileName}`,
    };
  }

  throw new Error('Invalid Gemini file reference.');
}

export async function getGeminiFile({
  fileNameOrUri,
  apiKey,
  timeoutMs = 20_000,
}: {
  fileNameOrUri: string;
  apiKey: string;
  timeoutMs?: number;
}) {
  const { fileName } = parseGeminiFileRef(fileNameOrUri);
  const payload = await fetchJsonWithRetry({
    url: `${GEMINI_API_BASE}/${fileName}?key=${encodeURIComponent(apiKey)}`,
    timeoutMs,
    buildInit: () => ({
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    }),
  });

  return toGeminiFileRecord(payload);
}

export async function deleteGeminiFile({
  fileNameOrUri,
  apiKey,
  timeoutMs = 20_000,
}: {
  fileNameOrUri: string;
  apiKey: string;
  timeoutMs?: number;
}) {
  const { fileName } = parseGeminiFileRef(fileNameOrUri);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/${fileName}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'DELETE',
        headers: {
          accept: 'application/json',
        },
        signal: controller.signal,
      },
    );

    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        text || `Gemini file delete failed with status ${response.status}.`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function uploadBytesToGeminiFile({
  bytes,
  mediaType,
  displayName,
  apiKey,
  timeoutMs,
  pollTimeoutMs = 20_000,
}: {
  bytes: Uint8Array;
  mediaType: string;
  displayName: string;
  apiKey: string;
  timeoutMs: number;
  pollTimeoutMs?: number;
}) {
  const startResponse = await fetchRawWithRetry({
    url: `${GEMINI_UPLOAD_BASE}?key=${encodeURIComponent(apiKey)}`,
    timeoutMs,
    buildInit: () => ({
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-goog-upload-protocol': 'resumable',
        'x-goog-upload-command': 'start',
        'x-goog-upload-header-content-length': String(bytes.byteLength),
        'x-goog-upload-header-content-type': mediaType,
      },
      body: JSON.stringify({
        file: {
          display_name: displayName,
        },
      }),
    }),
  });

  const uploadUrl = startResponse.headers.get('x-goog-upload-url');

  if (!uploadUrl) {
    throw new Error('Gemini resumable upload URL was not returned.');
  }

  const payload = await fetchJsonWithRetry({
    url: uploadUrl,
    timeoutMs,
    buildInit: () => ({
      body: bytes as unknown as BodyInit,
      method: 'POST',
      headers: {
        'content-type': mediaType,
        'content-length': String(bytes.byteLength),
        'x-goog-upload-command': 'upload, finalize',
        'x-goog-upload-offset': '0',
      },
    }),
  });

  let file = toGeminiFileRecord(payload);

  if (file.state === 'ACTIVE' || file.state === null) {
    return file;
  }

  const pollUntil = Date.now() + pollTimeoutMs;

  while (Date.now() < pollUntil) {
    await sleep(DEFAULT_POLL_INTERVAL_MS);
    file = await getGeminiFile({
      fileNameOrUri: file.name,
      apiKey,
      timeoutMs,
    });

    if (file.state === 'ACTIVE' || file.state === null) {
      return file;
    }

    if (file.state === 'FAILED') {
      throw new Error('Gemini file processing failed.');
    }
  }

  throw new Error('Gemini file processing timed out.');
}
