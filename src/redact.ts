/** Anything shaped like a BladeCP API key. */
const KEY_PATTERN = /bcp_(live|sand)_[A-Za-z0-9_-]+/g;

/**
 * Removes API keys from text before it reaches a terminal, a pipe or a file.
 * Known secrets are removed verbatim first; the pattern catches the rest.
 */
export function redact(text: string, secrets: Iterable<string> = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    const prefix = /^bcp_(?:live|sand)_/.exec(secret)?.[0] ?? '';
    out = out.split(secret).join(`${prefix}[redacted]`);
  }
  return out.replace(KEY_PATTERN, (_match, env: string) => `bcp_${env}_[redacted]`);
}
