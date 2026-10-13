// Verifies the root .easignore (design §13.2). EAS uses .easignore INSTEAD of every .gitignore,
// so it must (1) ignore everything git ignores, (2) upload no secrets and no server apps, and
// (3) still upload what the mobile build needs. Walks the real working tree; run it from anywhere:
//   node apps/mobile/scripts/check-easignore.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ignore from 'ignore';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const easignorePath = resolve(repoRoot, '.easignore');

if (!existsSync(easignorePath)) {
  console.error(`check-easignore: ${easignorePath} does not exist`);
  process.exit(1);
}

const eas = ignore().add(readFileSync(easignorePath, 'utf8'));

function gitList(args) {
  const out = execFileSync('git', ['ls-files', '-z', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

// 2. Candidate paths.
const kept = gitList(['--cached', '--others', '--exclude-standard']);
const gitIgnored = gitList(['--others', '--ignored', '--exclude-standard', '--directory']);

const failures = [];

// 3. Superset: everything git ignores must be ignored by .easignore too.
const notCovered = gitIgnored.filter((p) => !eas.ignores(p));
if (notCovered.length > 0) {
  failures.push(['git-ignored paths that .easignore would upload', notCovered]);
}

// 4. Nothing secret or server-side in the upload.
const uploaded = kept.filter((p) => !eas.ignores(p));
const forbidden = ignore().add([
  '*.pem',
  '.env*',
  '*.jks',
  '*.keystore',
  '*.p12',
  '*.p8',
  '*.key',
  'google-services.json',
  '/apps/api/',
  '/apps/web/',
  '/.agents/',
]);
const leaked = uploaded.filter((p) => forbidden.ignores(p));
if (leaked.length > 0) failures.push(['secret or server paths in the upload', leaked]);

// 5. Required files are uploaded.
const required = [
  'apps/mobile/package.json',
  'apps/mobile/app.config.ts',
  'packages/shared/src/index.ts',
  'packages/shared/package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];
const uploadedSet = new Set(uploaded);
const missing = required.filter((p) => !uploadedSet.has(p));
if (missing.length > 0) failures.push(['required paths missing from the upload', missing]);

// Summary.
const byTop = new Map();
for (const p of uploaded) {
  const parts = p.split('/');
  const top =
    parts.length > 2 && (parts[0] === 'apps' || parts[0] === 'packages')
      ? `${parts[0]}/${parts[1]}`
      : parts.length > 1
        ? parts[0]
        : '(root files)';
  byTop.set(top, (byTop.get(top) ?? 0) + 1);
}
console.log(`check-easignore: ${uploaded.length} files would be uploaded`);
for (const [top, n] of [...byTop.entries()].sort()) console.log(`  ${top}: ${n}`);
console.log(`  git-ignored paths checked: ${gitIgnored.length}`);
console.log(`  *.pem / .env* / keystores in upload: ${leaked.length}`);

if (failures.length > 0) {
  for (const [title, paths] of failures) {
    console.error(`FAIL: ${title} (${paths.length}):`);
    for (const p of paths.slice(0, 50)) console.error(`  ${p}`);
    if (paths.length > 50) console.error(`  … ${paths.length - 50} more`);
  }
  process.exit(1);
}
console.log('check-easignore: OK');
