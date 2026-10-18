import { spawn } from 'node:child_process';

/**
 * Opens a URL in the default browser. Resolves `false` when no opener is
 * available (headless servers, containers); the caller always prints the
 * address as well, so the person can copy it.
 */
export function openInBrowser(url: string, platform: NodeJS.Platform): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return Promise.resolve(false);
  let command: string;
  let args: string[];
  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    // rundll32 keeps `&` in the query string intact, unlike `cmd /c start`.
    command = 'rundll32';
    args = ['url.dll,FileProtocolHandler', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

function pipeTo(command: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true,
      });
      child.once('error', () => resolve(false));
      child.once('close', (code) => resolve(code === 0));
      child.stdin?.end(text);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Copies text to the clipboard with the system tool (pbcopy, clip, wl-copy,
 * xclip or xsel). Resolves `false` when none is available.
 */
export async function copyToClipboard(text: string, platform: NodeJS.Platform): Promise<boolean> {
  if (platform === 'darwin') return pipeTo('pbcopy', [], text);
  if (platform === 'win32') return pipeTo('clip', [], text);
  for (const [command, args] of [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ] as const) {
    if (await pipeTo(command, [...args], text)) return true;
  }
  return false;
}
