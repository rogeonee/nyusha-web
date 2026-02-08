import 'server-only';

import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import {
  createSession,
  deleteSession,
  getSessionWithUser,
} from '@/lib/db/queries';

const SESSION_COOKIE_NAME = 'nyusha_session';
const SESSION_MAX_AGE_DAYS = 30;

type SessionTokenPayload = {
  sid: string;
};

function getSessionCookieConfig(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

function getAuthSecretKey() {
  const authSecret = process.env.AUTH_SECRET;

  if (!authSecret) {
    throw new Error('AUTH_SECRET is required');
  }

  return new TextEncoder().encode(authSecret);
}

async function signSessionToken({
  sessionId,
  userId,
  expiresAt,
}: {
  sessionId: string;
  userId: string;
  expiresAt: Date;
}) {
  return new SignJWT({ sid: sessionId } satisfies SessionTokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getAuthSecretKey());
}

async function parseSessionToken(token: string) {
  try {
    const verified = await jwtVerify(token, getAuthSecretKey(), {
      algorithms: ['HS256'],
    });

    if (typeof verified.payload.sub !== 'string') {
      return null;
    }

    if (typeof verified.payload.sid !== 'string') {
      return null;
    }

    return {
      userId: verified.payload.sub,
      sessionId: verified.payload.sid,
    };
  } catch {
    return null;
  }
}

export async function createUserSession(userId: string) {
  const expiresAt = new Date(
    Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  );
  const session = await createSession({ userId, expiresAt });
  const token = await signSessionToken({
    sessionId: session.id,
    userId,
    expiresAt,
  });
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieConfig(expiresAt));
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const parsed = await parseSessionToken(token);

    if (parsed) {
      await deleteSession(parsed.sessionId);
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const parsed = await parseSessionToken(token);

  if (!parsed) {
    return null;
  }

  const result = await getSessionWithUser(parsed.sessionId);

  if (!result) {
    return null;
  }

  if (result.user.id !== parsed.userId) {
    return null;
  }

  return result.user;
}
