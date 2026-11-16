import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = process.env.GITHUB_RUN_NUMBER || '';
if (!/^[0-9]+$/.test(run)) {
  console.error('GITHUB_RUN_NUMBER is required');
  process.exit(1);
}

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [major, minor] = String(pkg.version || '1.2.0').split('.');
pkg.version = `${major || '1'}.${minor || '2'}.${run}`;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(pkg.version);
