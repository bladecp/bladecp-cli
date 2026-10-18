// How this copy of the CLI was installed, read from the real path of its
// binary. Only global installs by a package manager can be updated in place.

import { PACKAGE_NAME } from './check.js';

export type InstallKind = 'global' | 'temporary' | 'project' | 'unknown';
export type Manager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'volta';

export interface Install {
  kind: InstallKind;
  manager: Manager | null;
  /** The command that updates a global install, as program and arguments. */
  command: { program: string; args: string[] } | null;
  /** Folder of the package (for messages). */
  path: string;
}

const LATEST = `${PACKAGE_NAME}@latest`;

const COMMANDS: Record<Manager, { program: string; args: string[] }> = {
  npm: { program: 'npm', args: ['install', '--global', LATEST] },
  pnpm: { program: 'pnpm', args: ['add', '--global', LATEST] },
  yarn: { program: 'yarn', args: ['global', 'add', LATEST] },
  bun: { program: 'bun', args: ['add', '--global', LATEST] },
  volta: { program: 'volta', args: ['install', LATEST] },
};

export function commandText(command: { program: string; args: string[] }): string {
  return [command.program, ...command.args].join(' ');
}

/** The command a person would run to update a global install with a manager. */
export function updateCommandFor(manager: Manager): { program: string; args: string[] } {
  return COMMANDS[manager];
}

export function detectInstall(binPath: string): Install {
  const path = binPath.replace(/\\/g, '/');
  const pkg = path.replace(/\/dist\/bin\.js$/, '');
  const global = (manager: Manager): Install => ({
    kind: 'global',
    manager,
    command: COMMANDS[manager],
    path: pkg,
  });
  const temporary = (manager: Manager): Install => ({
    kind: 'temporary',
    manager,
    command: null,
    path: pkg,
  });
  // Run once by npx, pnpm dlx, yarn dlx or bunx: nothing to update.
  if (/\/_npx\//.test(path)) return temporary('npm');
  if (/\/dlx[-/]/.test(path)) return temporary('pnpm');
  if (/\/bunx-/.test(path)) return temporary('bun');
  if (/\/xfs-[^/]+\//.test(path)) return temporary('yarn');
  if (/\/\.volta\/tools\/image\/packages\//.test(path)) return global('volta');
  if (/\/\.bun\/install\/global\//.test(path)) return global('bun');
  if (/\/pnpm\/global\/|\/\.pnpm-global\/|\/pnpm-global\//.test(path)) return global('pnpm');
  if (/\/yarn\/global\/|\/\.config\/yarn\/global\/|\/Yarn\/Data\/global\//.test(path))
    return global('yarn');
  // npm: <prefix>/lib/node_modules on Unix, %APPDATA%/npm/node_modules on Windows.
  if (
    /\/lib\/node_modules\/@bladecp\/cli$/.test(pkg) ||
    /\/npm\/node_modules\/@bladecp\/cli$/i.test(pkg)
  )
    return global('npm');
  if (/\/node_modules\/@bladecp\/cli$/.test(pkg)) {
    return { kind: 'project', manager: null, command: null, path: pkg };
  }
  return { kind: 'unknown', manager: null, command: null, path: pkg };
}
