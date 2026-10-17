import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Pkce {
  verifier: string;
  challenge: string;
  method: 'S256';
}

/** RFC 7636 S256 challenge for a verifier. */
export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/**
 * True for values a query parser that decodes JSON would turn into a number,
 * boolean or null. The Hub reads query values that way, so `state` and
 * `code_challenge` must never look like one.
 */
export function looksLikeJsonLiteral(value: string): boolean {
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value) || ['true', 'false', 'null'].includes(value);
}

/** 32 random bytes as base64url (43 characters), never a JSON literal. */
function randomToken(): string {
  for (;;) {
    const token = randomBytes(32).toString('base64url');
    if (!looksLikeJsonLiteral(token)) return token;
  }
}

export function createPkce(): Pkce {
  // 32 random bytes give a 43 character verifier, the RFC 7636 minimum length.
  for (;;) {
    const verifier = randomToken();
    const challenge = challengeFor(verifier);
    if (!looksLikeJsonLiteral(challenge)) return { verifier, challenge, method: 'S256' };
  }
}

/** Opaque `state` for the connect flow: 32 random bytes, base64url. */
export function randomState(): string {
  return randomToken();
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
