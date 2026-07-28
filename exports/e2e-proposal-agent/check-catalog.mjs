import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WS = path.join(__dirname, '../../artifacts/workspace-suite/src/lib');

const gold = JSON.parse(fs.readFileSync(path.join(WS, 'assets/goldFinancialScenarios.json'), 'utf8'));
const catalogSrc = fs.readFileSync(path.join(WS, 'quoteBuilderCatalog.ts'), 'utf8');
const labels = [...catalogSrc.matchAll(/L\([^,]+,\s*'([^']+)'/g)].map((m) => m[1]);
const labelsQuoted = [...catalogSrc.matchAll(/L\([^,]+,\s*"([^"]+)"/g)].map((m) => m[1]);
const catalog = new Set([...labels, ...labelsQuoted]);

for (const [id, sc] of Object.entries(gold)) {
  const missing = (sc.form.costLineLabels || []).filter((l) => !catalog.has(l));
  console.log(id, 'lines', sc.form.costLineLabels.length, 'missing', missing.length, missing.join(' | ') || 'none');
}
