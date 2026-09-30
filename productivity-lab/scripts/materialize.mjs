import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const app of ['csv-rescue', 'pocket-pdf', 'instant-slides']) {
  const target = resolve(root, 'apps', app, 'src');
  mkdirSync(target, { recursive: true });
  for (const file of ['server.js', 'artifacts.js']) copyFileSync(resolve(root, 'runtime', file), resolve(target, file));
}
process.stdout.write('Shared runtime copied into all three apps.\n');
