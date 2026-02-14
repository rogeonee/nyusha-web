function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getAllowedEmails() {
  const value = process.env.FAMILY_ALLOWED_EMAILS ?? '';

  return new Set(
    value
      .split(',')
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  );
}

export function isAllowedFamilyEmail(email: string) {
  const allowedEmails = getAllowedEmails();

  if (allowedEmails.size === 0) {
    return false;
  }

  return allowedEmails.has(normalizeEmail(email));
}
