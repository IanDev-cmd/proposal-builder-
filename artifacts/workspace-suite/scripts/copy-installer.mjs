import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../../installer/WEOTT-Quote-Builder-Setup.exe');
const destDir = path.resolve(here, '../dist/public');
const size = fs.statSync(src).size;
if (size < 1_000_000) {
  throw new Error('Setup file is missing or is only a Git LFS pointer.');
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'WEOTT-Quote-Builder-Setup.exe'));
