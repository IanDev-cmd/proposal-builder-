import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogCandidates = [
  path.join(root, 'artifacts/workspace-suite/src/lib/_catalogOrig.ts'),
  path.join(root, 'artifacts/workspace-suite/src/lib/quoteBuilderCatalog.ts'),
];
const catalogPath = catalogCandidates.find((p) => fs.existsSync(p));
const src = fs.readFileSync(catalogPath, 'utf8');

const lines = [];
const re =
  /L\(\s*'([^']+)'\s*,\s*'((?:\\'|[^'])*)'\s*,\s*'([^']+)'\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/g;
let m;
while ((m = re.exec(src))) {
  const [, section, label, multiplier, optsRaw] = m;
  const rec = {
    id: `${section}:${label}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80),
    section,
    label,
    multiplier,
    aliases: [label],
  };
  if (optsRaw) {
    if (/defaultOn:\s*true/.test(optsRaw)) rec.defaultOn = true;
    const aw = optsRaw.match(/autoWithMenu:\s*\/(.+?)\/([a-z]*)/);
    if (aw) rec.autoWithMenu = aw[1];
    const pw = optsRaw.match(/proposalWording:\s*'((?:\\'|[^'])*)'/);
    if (pw) rec.proposalWording = pw[1].replace(/\\'/g, "'");
  }
  lines.push(rec);
}

function extractRecord(name) {
  const start = src.indexOf(`export const ${name}`);
  if (start < 0) return {};
  const brace = src.indexOf('{', start);
  let depth = 0;
  let end = brace;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(brace, end + 1);
  const out = {};
  const rr = /(?:'([^']+)'|([A-Za-z][A-Za-z0-9 ]*))\s*:\s*'([^']*)'/g;
  let x;
  while ((x = rr.exec(body))) {
    const k = x[1] || x[2];
    if (k && k.length >= 2 && !k.includes('Record') && k !== 'string') out[k] = x[3];
  }
  return out;
}

function usableAlias(alias) {
  return typeof alias === 'string' && alias.trim().length >= 2 && alias !== 's';
}

function pruneMap(map) {
  return Object.fromEntries(Object.entries(map).filter(([k]) => usableAlias(k)));
}

const vesselAliases = pruneMap(extractRecord('VESSEL_TO_COST_MOTHER'));
const menuAliases = pruneMap(extractRecord('MENU_TO_COST_MOTHER'));
const upgradeToLineLabel = pruneMap(extractRecord('UPGRADE_TO_LINE_LABEL'));

const noteAliases = {
  HFB: 'Hot Fork Buffet (All Seasons)',
  '3CSD': 'Three Course Seated Dinner (All Seasons)',
  '2CSD': 'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
  'SUB CANS': 'Substantial Canapes (All Sesons)',
  CANAPES: 'Canapes (All Seasons)',
  'STREET FOOD': 'Street Food Station (All Seasons)',
  'BOWL FOOD': 'Bowl Food (All Seasons)',
  BBQ: 'Barbecue',
  'CHARCUTERIE CUPS': 'Charcuterie Cups (All Seasons)',
  'CHARCUTERIE STATION': 'Charcuterie Station (All Seasons)',
  'BURGER STATION': 'Burger Station',
  'BG MUSIC': 'Background Music/Sound Equipment Hire',
  'COCKTAIL RECEPTION': 'Cocktail Reception (1 x glass per guest)',
  'CASINO TABLE x 2': 'Casino table with croupier - x 2',
  'CASINO TABLE': 'Casino table with croupier - x 1',
  'PHOTO BOOTH': 'Photobooth',
  TV: 'TV - 55"',
  'TEAM BUILDING': 'Team building activities with performance coach',
  'DRINK TOKENS x 3': 'Drink tokens - x 3',
  'DRINK TOKENS x 2': 'Drink tokens - x 2',
};

for (const [alias, label] of Object.entries(noteAliases)) {
  const line = lines.find((l) => l.label === label);
  if (line && !line.aliases.includes(alias)) line.aliases.push(alias);
}
for (const line of lines) {
  line.aliases = line.aliases.filter(usableAlias);
}
for (const [alias, label] of Object.entries(menuAliases)) {
  const line = lines.find((l) => l.label === label);
  if (line && usableAlias(alias) && !line.aliases.includes(alias)) line.aliases.push(alias);
}

const out = {
  schema: 'weott.nexus.catalogue.v1',
  version: 1,
  lines,
  vesselAliases,
  menuAliases,
  upgradeToLineLabel,
  noteAliases,
};

if (lines.length < 50) {
  console.error(`refusing to write taxonomy from ${catalogPath}: only ${lines.length} lines`);
  process.exit(1);
}
const destA = path.join(root, 'artifacts/workspace-suite/src/lib/assets/catalogueTaxonomy.json');
const destB = path.join(root, 'exports/nexus-catalog/catalogueTaxonomy.json');
fs.mkdirSync(path.dirname(destB), { recursive: true });
const json = JSON.stringify(out, null, 2);
fs.writeFileSync(destA, json);
fs.writeFileSync(destB, json);
fs.writeFileSync(
  path.join(root, 'exports/nexus-catalog/NexusCatalogTaxonomy.gs'),
  '/** Paste alongside NexusCatalog.gs — canonical line taxonomy. */\nvar NEXUS_CATALOGUE_TAXONOMY = ' +
    json +
    ';\n',
);
console.log(
  `wrote ${lines.length} lines, ${Object.keys(vesselAliases).length} vessels, ${Object.keys(menuAliases).length} menus`,
);
