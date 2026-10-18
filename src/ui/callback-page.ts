// The page the browser shows after the sign-in, served by the CLI on
// 127.0.0.1. Same identity as the terminal: dark, one indigo accent.
import type { ServerResponse } from 'node:http';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function callbackPage(lang: string, title: string, body: string, ok: boolean): string {
  const accent = ok ? '#6366f1' : '#dc2626';
  // i18n-exempt: HTML markup; the title and the body come from the catalog
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BladeCP CLI</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d12; color: #e5e7eb; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 28rem; padding: 2rem; border: 1px solid #1f2430; border-radius: 12px; background: #11141b; }
  h1 { margin: 0 0 .5rem; font-size: 1.25rem; color: ${accent}; }
  p { margin: 0; color: #9ca3af; }
</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></main></body>
</html>`;
}

export function sendPage(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8', // i18n-exempt: header value
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    Connection: 'close',
  });
  res.end(html);
}
