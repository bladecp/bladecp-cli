#!/usr/bin/env bash
# Structure and hygiene gate for the public BladeCP CLI repository.
#
#   bash scripts/check-public-tree.sh            files, text, links and package metadata
#   bash scripts/check-public-tree.sh --package  also checks the npm package contents
#                                                (run it after `pnpm build`)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT"

CHECK_PACKAGE=0
for arg in "$@"; do
  case "$arg" in
    --package) CHECK_PACKAGE=1 ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "error: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

for command in node find grep; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "error: $command is required" >&2
    exit 2
  }
done
if [ "$CHECK_PACKAGE" = 1 ]; then
  command -v npm >/dev/null 2>&1 || { echo "error: npm is required for --package" >&2; exit 2; }
fi

required=(
  LICENSE README.md README.pt-BR.md README.es.md CHANGELOG.md SECURITY.md CONTRIBUTING.md
  package.json pnpm-lock.yaml reference.json biome.json tsconfig.json tsconfig.build.json
  vitest.config.ts .nvmrc .gitignore
  src/bin.ts src/cli.ts src/reference.ts
  scripts/clean.mjs scripts/postbuild.mjs scripts/export-reference.mjs
  docs/installation.md docs/authentication.md docs/commands.md docs/automation.md
  docs/troubleshooting.md docs/release-process.md docs/repository-governance.md
  assets/logo-light.svg assets/logo-dark.svg
  .github/workflows/ci.yml .github/pull_request_template.md
)
for path in "${required[@]}"; do
  [ -f "$path" ] || { echo "error: required public file is missing: $path" >&2; exit 1; }
done

links="$(find . -path ./node_modules -prune -o -path ./.git -prune -o -type l -print)"
if [ -n "$links" ]; then
  echo "error: symbolic links are not allowed in the public tree" >&2
  printf '%s\n' "$links" >&2
  exit 1
fi

node --input-type=module - "$ROOT" "$CHECK_PACKAGE" <<'JS'
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

const [root, checkPackage] = process.argv.slice(2);
const problems = [];
const fail = (message) => problems.push(message);

// Files that belong to the repository: Git's view when available, otherwise a
// walk that skips what .gitignore excludes for this project.
function listFiles() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (normalize(top) === normalize(root)) {
      const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        cwd: root,
        encoding: 'utf8',
      });
      const files = out.split('\0').filter((file) => file && existsSync(join(root, file)));
      if (files.length > 0) return files.sort();
    }
  } catch {
    // Not a Git checkout: fall back to the walk below.
  }
  const skipDirs = new Set(['.git', 'node_modules', 'dist', 'coverage']);
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(path);
      } else if (!entry.name.endsWith('.tgz') && !entry.name.endsWith('.log') && entry.name !== '.DS_Store') {
        files.push(path);
      }
    }
  };
  walk('');
  return files.sort();
}

const files = listFiles();

// Closed layout: only the reviewed top-level entries and helper scripts.
const topLevel = new Set([
  '.github', '.gitignore', '.nvmrc', 'assets', 'docs', 'scripts', 'src', 'test',
  'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'README.md', 'README.pt-BR.md', 'README.es.md',
  'SECURITY.md', 'biome.json', 'package.json', 'pnpm-lock.yaml', 'reference.json',
  'tsconfig.json', 'tsconfig.build.json', 'vitest.config.ts',
]);
const scripts = new Set([
  'scripts/check-public-tree.sh', 'scripts/clean.mjs', 'scripts/export-reference.mjs', 'scripts/postbuild.mjs',
]);
const languages = { 'README.md': 'en', 'README.pt-BR.md': 'pt-BR', 'README.es.md': 'es' };
const artwork = Object.values(languages).flatMap((lang) =>
  ['hero', 'hero-compact', 'architecture', 'architecture-compact'].map((name) => `assets/${name}.${lang}.svg`),
);
const assets = new Set(['assets/README.md', 'assets/logo-dark.svg', 'assets/logo-light.svg', ...artwork]);
for (const path of assets) if (!files.includes(path)) fail(`missing public asset: ${path}`);
for (const file of files) {
  const first = file.split('/')[0];
  if (!topLevel.has(first)) fail(`unexpected file outside the public layout: ${file}`);
  else if (first === 'scripts' && !scripts.has(file)) fail(`unexpected script: ${file}`);
  else if (first === 'assets' && !assets.has(file)) fail(`unexpected asset: ${file}`);
  else if (first === 'docs' && !file.endsWith('.md')) fail(`documentation must be Markdown: ${file}`);
  else if (first === '.github' && !/\.(ya?ml|md)$/.test(file)) fail(`unexpected file in .github: ${file}`);
}

// Package metadata.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const expect = (condition, message) => {
  if (!condition) fail(`package.json: ${message}`);
};
expect(pkg.name === '@bladecp/cli', 'name must be @bladecp/cli');
expect(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version ?? ''), 'version must be semver');
expect(pkg.license === 'MIT', 'license must be MIT');
expect(pkg.type === 'module', 'type must be module');
expect(pkg.bin?.bladecp === 'dist/bin.js', 'bin.bladecp must be dist/bin.js');
expect(pkg.engines?.node === '>=20', 'engines.node must be >=20');
expect(pkg.publishConfig?.access === 'public', 'publishConfig.access must be public');
expect(pkg.repository?.url === 'git+https://github.com/bladecp/bladecp-cli.git', 'repository.url must point to bladecp/bladecp-cli');
expect(pkg.scripts?.lint === 'biome check .', 'the lint script must be "biome check ."');
expect(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'the CLI has no runtime dependencies');
const expectedFiles = ['dist', '!dist/**/*.map', '!dist/reference.js', 'README.md', 'README.pt-BR.md', 'README.es.md', 'CHANGELOG.md'];
expect(JSON.stringify(pkg.files) === JSON.stringify(expectedFiles), `files must be ${JSON.stringify(expectedFiles)}`);
for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
  for (const match of String(command).matchAll(/\bnode\s+(scripts\/[^\s&|;]+)/g)) {
    if (!existsSync(join(root, match[1]))) expect(false, `script "${name}" uses a missing file: ${match[1]}`);
  }
}

// Version coherence.
const reference = JSON.parse(readFileSync(join(root, 'reference.json'), 'utf8'));
if (reference.version !== pkg.version) fail(`reference.json version ${reference.version} differs from package.json ${pkg.version}`);
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const escaped = String(pkg.version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const entry = new RegExp(`^## \\[${escaped}\\] - ([0-9]{4}-[0-9]{2}-[0-9]{2})$`, 'm').exec(changelog);
if (!entry || Number.isNaN(Date.parse(`${entry[1]}T00:00:00Z`))) {
  fail(`CHANGELOG.md needs a dated section "## [${pkg.version}] - YYYY-MM-DD"`);
}
if (!readFileSync(join(root, 'LICENSE'), 'utf8').startsWith('MIT License')) fail('LICENSE must be the MIT License');

// Brand assets: vector paths only.
for (const svg of ['assets/logo-light.svg', 'assets/logo-dark.svg']) {
  const text = readFileSync(join(root, svg), 'utf8');
  const tags = new Set([...text.matchAll(/<([A-Za-z][\w:-]*)/g)].map((m) => m[1]));
  for (const tag of tags) if (tag !== 'svg' && tag !== 'path') fail(`${svg}: unexpected <${tag}> element`);
  if (/<script|href\s*=|\son[a-z]+\s*=|data:|<!ENTITY/i.test(text)) fail(`${svg}: scripts, links or embedded data are not allowed`);
}

// README artwork: static vector files with an accessible title and
// description, no active content and no external references. GitHub and npm
// show them through <img>, where scripts never run; the tree stays clean anyway.
const artworkTags = new Set([
  'svg', 'title', 'desc', 'style', 'defs', 'linearGradient', 'radialGradient', 'stop', 'mask', 'filter',
  'feGaussianBlur', 'clipPath', 'g', 'rect', 'circle', 'ellipse', 'path', 'text', 'symbol', 'use', 'marker',
]);
for (const svg of artwork) {
  if (!existsSync(join(root, svg))) continue;
  const text = readFileSync(join(root, svg), 'utf8');
  for (const [, tag] of text.matchAll(/<([A-Za-z][\w:-]*)/g)) {
    if (!artworkTags.has(tag)) fail(`${svg}: unexpected <${tag}> element`);
  }
  for (const [, value] of text.matchAll(/\b(?:href|src)\s*=\s*["']([^"']*)["']/g)) {
    if (!value.startsWith('#')) fail(`${svg}: external reference ${value}`);
  }
  for (const [, value] of text.matchAll(/url\(\s*["']?([^)"']*)/g)) {
    if (!value.startsWith('#')) fail(`${svg}: external url(${value})`);
  }
  if (/\son[a-z]+\s*=|data:|@import|<!ENTITY|<!DOCTYPE/i.test(text)) fail(`${svg}: active content is not allowed`);
  if (!/<svg[^>]*\brole="img"/.test(text) || !/<title[ >]/.test(text) || !/<desc[ >]/.test(text)) {
    fail(`${svg}: needs role="img", a <title> and a <desc>`);
  }
}

// The READMEs also ship in the npm package, so their images use absolute URLs
// to this repository. Every such URL must point to a file of this tree, and
// each README shows the artwork of its own language.
const repoUrl = /https:\/\/(?:raw\.githubusercontent\.com\/bladecp\/bladecp-cli\/main|github\.com\/bladecp\/bladecp-cli\/blob\/main)\/([^\s"')<>#?]+)/g;
for (const [readme, lang] of Object.entries(languages)) {
  if (!existsSync(join(root, readme))) continue;
  const text = readFileSync(join(root, readme), 'utf8');
  for (const [url, path] of text.matchAll(repoUrl)) {
    if (!files.includes(path)) fail(`${readme}: ${url} does not match a file of this tree`);
  }
  for (const name of ['hero', 'hero-compact', 'architecture', 'architecture-compact']) {
    const asset = `https://raw.githubusercontent.com/bladecp/bladecp-cli/main/assets/${name}.${lang}.svg`;
    if (!text.includes(asset)) fail(`${readme}: missing ${asset}`);
  }
}

// Text rules.
const isText = (file) => !/\.(png|jpe?g|gif|ico|tgz|gz|zip)$/i.test(file);
const userFacing = (file) =>
  (file.startsWith('src/') && file.endsWith('.ts')) ||
  file.startsWith('docs/') ||
  file.startsWith('.github/') ||
  /^(README(\.[A-Za-z-]+)?\.md|CHANGELOG\.md|SECURITY\.md|CONTRIBUTING\.md|assets\/README\.md|assets\/[a-z-]+\.[A-Za-z-]+\.svg)$/.test(file);
const emDash = new RegExp(String.fromCodePoint(0x2014));
const editorial = /(^|[^A-Za-z0-9_])(TODO|FIXME|DRAFT|TBD)([^A-Za-z0-9_]|$)/;
const keyLike = /bcp_(?:live|sand)_([A-Za-z0-9_-]{20,})/g;
const tokens = [
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /npm_[A-Za-z0-9]{36}/,
  /_authToken\s*=\s*[^\s$]/,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
];
for (const file of files) {
  if (!isText(file)) continue;
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  lines.forEach((line, index) => {
    const where = `${file}:${index + 1}`;
    if (userFacing(file) && emDash.test(line)) fail(`${where}: em dash in user-facing text`);
    if (file !== 'scripts/check-public-tree.sh' && editorial.test(line)) fail(`${where}: editorial marker`);
    for (const match of line.matchAll(keyLike)) {
      // Test fixtures are recognizable placeholders; a real key mixes cases and digits.
      const suffix = match[1];
      if (/[a-z]/.test(suffix) && /[A-Z]/.test(suffix) && /[0-9]/.test(suffix)) {
        fail(`${where}: value that looks like a real API key`);
      }
    }
    for (const pattern of tokens) if (pattern.test(line)) fail(`${where}: credential-like value`);
  });
}

// Local Markdown links.
const markdownLink = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
for (const file of files.filter((f) => f.endsWith('.md'))) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const match of text.matchAll(markdownLink)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0]);
    if (!path) continue;
    const resolved = normalize(join(root, dirname(file), path));
    if (!(resolved + sep).startsWith(root + sep) || !existsSync(resolved)) fail(`${file}: broken link ${match[1]}`);
  }
}

// npm package contents.
if (checkPackage === '1') {
  if (!existsSync(join(root, 'dist/bin.js'))) {
    fail('dist/bin.js is missing: run "pnpm build" before --package');
  } else {
    const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const [pack] = JSON.parse(output);
    const packed = new Map(pack.files.map((f) => [f.path, f]));
    const built = [];
    const walk = (dir) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith('.js') && path !== 'dist/reference.js') built.push(path);
      }
    };
    walk('dist');
    const expected = new Set([
      'package.json', 'LICENSE', 'README.md', 'README.pt-BR.md', 'README.es.md', 'CHANGELOG.md', ...built,
    ]);
    for (const path of packed.keys()) if (!expected.has(path)) fail(`npm package: unexpected file ${path}`);
    for (const path of expected) if (!packed.has(path)) fail(`npm package: missing file ${path}`);
    const bin = packed.get('dist/bin.js');
    if (bin && (bin.mode & 0o111) === 0) fail('npm package: dist/bin.js is not executable');
    if (pack.name !== pkg.name || pack.version !== pkg.version) fail('npm package: name or version differs from package.json');
    if (statSync(join(root, 'dist/bin.js')).size === 0 || !readFileSync(join(root, 'dist/bin.js'), 'utf8').startsWith('#!/usr/bin/env node')) {
      fail('npm package: dist/bin.js lost its shebang');
    }
  }
}

if (problems.length > 0) {
  console.error(`Public tree check failed:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Public tree checks passed (${files.length} files${checkPackage === '1' ? ', npm package contents verified' : ''}).`);
JS
