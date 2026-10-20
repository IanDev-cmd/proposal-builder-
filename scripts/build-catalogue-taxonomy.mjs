/**
 * Catalogue taxonomy is the financial contract.
 * Reads exports/nexus-catalog/catalogueTaxonomy.json and writes:
 *   quoteCatalogBindings.generated.ts  — line definitions consumed by quoteBuilderCatalog.ts
 *   payload_schema.py                  — financial constants and the catalogue line model
 *   NexusCatalogTaxonomy.gs            — passive taxonomy lookup tables
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'exports/nexus-catalog/catalogueTaxonomy.json');
const suiteJson = path.join(root, 'artifacts/workspace-suite/src/lib/assets/catalogueTaxonomy.json');
const catalogPath = path.join(root, 'artifacts/workspace-suite/src/lib/quoteBuilderCatalog.ts');
const bindingsPath = path.join(
  root,
  'artifacts/workspace-suite/src/lib/quoteCatalogBindings.generated.ts',
);
const payloadPath = path.join(root, 'artifacts/pdf-engine/payload_schema.py');
const pythonPath = path.join(root, 'artifacts/pdf-engine/catalogue_constants.py');
const gasPath = path.join(root, 'exports/nexus-catalog/NexusCatalogTaxonomy.gs');

const FINANCIAL_DEFAULTS = {
  vatRate: 0.2,
  contingencyRate: 0.0225,
  staffHoursBuffer: 3,
  eventManagerHoursBuffer: 4,
  minBillableHours: 4,
};

const MULTIPLIERS = [
  'vessel_hours',
  'guests',
  'guests_hours',
  'hours',
  'staff_hours',
  'tables',
  'set',
];
const MULTIPLIER_SET = new Set(MULTIPLIERS);

const doc = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!doc || !Array.isArray(doc.lines) || doc.lines.length < 50) {
  console.error(`refusing to emit bindings: ${sourcePath} has ${doc?.lines?.length || 0} lines`);
  process.exit(1);
}

const ids = new Set();
for (const line of doc.lines) {
  if (!line.id || !line.section || !line.label || !MULTIPLIER_SET.has(line.multiplier)) {
    console.error(`invalid taxonomy line: ${JSON.stringify(line)}`);
    process.exit(1);
  }
  if (ids.has(line.id)) {
    console.error(`duplicate taxonomy id: ${line.id}`);
    process.exit(1);
  }
  ids.add(line.id);
}

doc.financial = { ...FINANCIAL_DEFAULTS, ...(doc.financial || {}) };
for (const [key, value] of Object.entries(FINANCIAL_DEFAULTS)) {
  if (typeof doc.financial[key] !== 'number' || !Number.isFinite(doc.financial[key])) {
    console.error(`financial.${key} must be a finite number`);
    process.exit(1);
  }
}

const taxonomy = {
  schema: doc.schema,
  version: doc.version,
  financial: doc.financial,
  lines: doc.lines,
  vesselAliases: doc.vesselAliases || {},
  menuAliases: doc.menuAliases || {},
  upgradeToLineLabel: doc.upgradeToLineLabel || {},
  noteAliases: doc.noteAliases || {},
};

const json = `${JSON.stringify(doc, null, 2)}\n`;
fs.writeFileSync(sourcePath, json);
fs.mkdirSync(path.dirname(suiteJson), { recursive: true });
fs.writeFileSync(suiteJson, json);

const fin = doc.financial;
const ts = `/** Generated from exports/nexus-catalog/catalogueTaxonomy.json. Do not edit. */
export const VAT_RATE = ${fin.vatRate};
export const CONTINGENCY_RATE = ${fin.contingencyRate};
export const STAFF_HOURS_BUFFER = ${fin.staffHoursBuffer};
export const EVENT_MANAGER_HOURS_BUFFER = ${fin.eventManagerHoursBuffer};
export const MIN_BILLABLE_HOURS = ${fin.minBillableHours};

export const GENERATED_TAXONOMY = ${JSON.stringify(taxonomy, null, 2)} as const;
`;
fs.writeFileSync(bindingsPath, ts);

const literal = MULTIPLIERS.map((name) => `"${name}"`).join(', ');
const generatedPy = `# BEGIN GENERATED CATALOGUE CONSTANTS — scripts/build-catalogue-taxonomy.mjs
VAT_RATE = ${fin.vatRate}
CONTINGENCY_RATE = ${fin.contingencyRate}
STAFF_HOURS_BUFFER = ${fin.staffHoursBuffer}
EVENT_MANAGER_HOURS_BUFFER = ${fin.eventManagerHoursBuffer}
MIN_BILLABLE_HOURS = ${fin.minBillableHours}


class CatalogueLineBinding(BaseModel):
    """Taxonomy line shape. Not applied to POST /generate, so PDF payload keys stay intact."""

    model_config = ConfigDict(extra="ignore")
    id: str
    section: str
    label: str
    multiplier: Literal[${literal}]


# END GENERATED CATALOGUE CONSTANTS`;

const payload = fs.readFileSync(payloadPath, 'utf8');
const start = payload.indexOf('# BEGIN GENERATED CATALOGUE CONSTANTS');
const end = payload.indexOf('# END GENERATED CATALOGUE CONSTANTS');
if (start < 0 || end < 0 || end < start) {
  console.error('payload_schema.py is missing the generated catalogue markers');
  process.exit(1);
}
const nextPayload =
  payload.slice(0, start) + generatedPy + payload.slice(end + '# END GENERATED CATALOGUE CONSTANTS'.length);
fs.writeFileSync(payloadPath, nextPayload);

fs.writeFileSync(
  pythonPath,
  `"""Generated re-exports. Assignments live in payload_schema.py. Do not edit."""

from payload_schema import (
    CONTINGENCY_RATE,
    EVENT_MANAGER_HOURS_BUFFER,
    MIN_BILLABLE_HOURS,
    STAFF_HOURS_BUFFER,
    VAT_RATE,
)

__all__ = [
    "CONTINGENCY_RATE",
    "EVENT_MANAGER_HOURS_BUFFER",
    "MIN_BILLABLE_HOURS",
    "STAFF_HOURS_BUFFER",
    "VAT_RATE",
]
`,
);

fs.writeFileSync(
  gasPath,
  `/** Generated from catalogueTaxonomy.json. Passive lookup only. Do not edit. */
var NEXUS_CATALOGUE_TAXONOMY = ${JSON.stringify(taxonomy)};

function nexusTaxonomyLines_() {
  var doc = NEXUS_CATALOGUE_TAXONOMY || {};
  return doc.lines || [];
}

function nexusTaxonomyFinancial_() {
  var doc = NEXUS_CATALOGUE_TAXONOMY || {};
  return doc.financial || {};
}

/** Label or alias → { section, multiplier }. No rate maths. */
function nexusTaxonomyLookup_(label) {
  var n = String(label || '').toLowerCase().replace(/\\s+/g, ' ').trim();
  if (!n) return null;
  var lines = nexusTaxonomyLines_();
  for (var i = 0; i < lines.length; i++) {
    var aliases = lines[i].aliases || [lines[i].label];
    for (var j = 0; j < aliases.length; j++) {
      var alias = String(aliases[j] || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      if (alias === n) {
        return { section: lines[i].section, multiplier: lines[i].multiplier };
      }
    }
  }
  return null;
}
`,
);

const catalog = fs.readFileSync(catalogPath, 'utf8');
if (!catalog.includes('GENERATED_TAXONOMY')) {
  console.error('quoteBuilderCatalog.ts must build its line catalogue from GENERATED_TAXONOMY');
  process.exit(1);
}
if (!catalog.includes("from '@/lib/quoteCatalogBindings.generated'")) {
  console.error('quoteBuilderCatalog.ts must re-export quoteCatalogBindings.generated');
  process.exit(1);
}

console.log(
  `bound ${doc.lines.length} lines from catalogueTaxonomy.json (vat ${fin.vatRate}, contingency ${fin.contingencyRate})`,
);
