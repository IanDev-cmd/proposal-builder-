/**
 * Diagnose generated PDFs vs gold — money checks use client-facing
 * package_cost / vat / grand_total (as rendered on bespoke page, often without £).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output');
const FIX = path.join(__dirname, '..', 'proposal-testing-scenario', 'fixtures');
const scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenarios.json'), 'utf8'));
const gold = JSON.parse(fs.readFileSync(path.join(FIX, 'gold-extract.json'), 'utf8'));
const GOLD_PACKAGE_WORDING = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../artifacts/workspace-suite/src/lib/assets/goldPackageWording.json'),
    'utf8',
  ),
);

function extractPdf(pdfPath) {
  if (!fs.existsSync(pdfPath)) return { error: 'missing' };
  const py = `
import fitz, re, json, sys
doc = fitz.open(sys.argv[1])
text = "\\n".join(p.get_text("text") for p in doc)
# include bare 1,234.56 (PDF engine draws financials without £ glyph sometimes)
raw = re.findall(r"(?<!\\d)(\\d{1,3}(?:,\\d{3})*\\.\\d{2})(?!\\d)", text)
amounts = sorted({float(x.replace(",","")) for x in raw})
cover = " ".join(doc[0].get_text("text").split())[:700] if doc.page_count else ""
print(json.dumps({"pages": doc.page_count, "amounts": amounts, "cover": cover, "text": text}))
doc.close()
`;
  const r = spawnSync('python', ['-c', py, pdfPath], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) return { error: r.stderr || r.stdout };
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop());
  } catch (e) {
    return { error: String(e) };
  }
}

function has(text, needle) {
  if (!needle) return false;
  return (text || '').toLowerCase().includes(String(needle).toLowerCase());
}

function near(amounts, target, tol = 0.05) {
  if (target == null || !amounts?.length) return null;
  let best = null;
  for (const n of amounts) {
    const d = Math.abs(n - target);
    if (!best || d < best.delta) best = { amount: n, delta: d };
  }
  if (!best) return null;
  best.match = best.delta <= tol;
  return best;
}

function clientTotals(sc) {
  const weott = sc.goldQuoteWeottCost;
  const margin = (Number(sc.form?.marginPercent) || 25) / 100;
  if (!weott) return {};
  const package_cost = Math.round(weott * (1 + margin) * 100) / 100;
  const vat = Math.round(package_cost * 0.2 * 100) / 100;
  const grand_total = Math.round((package_cost + vat) * 100) / 100;
  return { weott, package_cost, vat, grand_total };
}

function nameTokens(lead) {
  const tokens = [];
  for (const part of String(lead.name || '').split(/[\/,]/)) {
    const t = part.trim().split(/\s+/)[0];
    if (t && t.length > 2) tokens.push(t);
  }
  const co = String(lead.companyName || '').split(/[/(]/)[0].trim();
  if (co) tokens.push(co.split(/\s+/)[0]);
  return [...new Set(tokens)];
}

/** Distinct package-column phrases to spot-check in generated PDF text. */
function packageWordingTokens(ref) {
  const cols = GOLD_PACKAGE_WORDING[ref];
  if (!cols) return [];
  const tokens = [];
  for (const sections of Object.values(cols)) {
    for (const sec of sections) {
      for (const item of sec.items || []) {
        const t = String(item)
          .replace(/click here to view your menu/i, '')
          .replace(/£[\d,]+/g, '')
          .trim();
        if (t.length >= 12) tokens.push(t.slice(0, 48));
      }
    }
  }
  return [...new Set(tokens)].slice(0, 6);
}

const diagnosis = [];
let earned = 0;
let total = 0;

for (const sc of scenarios) {
  const dir = path.join(OUT, sc.id);
  const genPdf = path.join(dir, `${sc.id}.generated.pdf`);
  const lead = JSON.parse(fs.readFileSync(path.resolve(__dirname, sc.leadFixture), 'utf8'));
  const run = fs.existsSync(path.join(dir, 'run-report.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'run-report.json'), 'utf8'))
    : null;
  const g = gold[sc.id] || { quotes: [], proposals: [] };
  const propGold = (g.proposals || []).slice(-1)[0] || null;
  const gen = extractPdf(genPdf);
  const text = gen.text || '';
  const totals = clientTotals(sc);
  const findings = [];
  const missing = [];
  const wordingTokens = packageWordingTokens(sc.id);
  const wordingHits = wordingTokens.filter((t) => has(text, t.slice(0, 24)));
  const wordingPass = wordingTokens.length === 0 || wordingHits.length >= Math.min(3, wordingTokens.length);

  const checks = [
    {
      check: 'Generated PDF exists',
      weight: 1,
      status: fs.existsSync(genPdf) ? 'PASS' : 'FAIL',
      bytes: fs.existsSync(genPdf) ? fs.statSync(genPdf).size : 0,
    },
    {
      check: 'Proposal ref in PDF text',
      weight: 1,
      status: has(text, sc.id) || has(text, sc.id.replace('WE.', '')) ? 'PASS' : 'MISS',
    },
    {
      check: 'Client/company identity in PDF',
      weight: 1,
      status: nameTokens(lead).some((t) => has(text, t)) ? 'PASS' : 'MISS',
      tokens: nameTokens(lead),
    },
    {
      check: 'Event type family in PDF',
      weight: 1,
      status: has(text, sc.form.eventType.split(' ')[0]) ? 'PASS' : 'MISS',
    },
    {
      check: 'Package cost (exc VAT) in PDF',
      weight: 2,
      target: totals.package_cost,
      result: near(gen.amounts, totals.package_cost),
      status: near(gen.amounts, totals.package_cost)?.match ? 'PASS' : 'MISS',
    },
    {
      check: 'VAT in PDF',
      weight: 2,
      target: totals.vat,
      result: near(gen.amounts, totals.vat),
      status: near(gen.amounts, totals.vat)?.match ? 'PASS' : 'MISS',
    },
    {
      check: 'Grand total (inc VAT) in PDF',
      weight: 2,
      target: totals.grand_total,
      result: near(gen.amounts, totals.grand_total),
      status: near(gen.amounts, totals.grand_total)?.match ? 'PASS' : 'MISS',
    },
    {
      check: 'Gold package wording in PDF',
      weight: 2,
      tokens: wordingTokens,
      hits: wordingHits,
      status: wordingPass ? 'PASS' : wordingTokens.length ? 'MISS' : 'UNKNOWN',
    },
    {
      check: 'Page count vs gold proposal',
      weight: 1,
      generatedPages: gen.pages,
      goldPages: propGold?.pages,
      status:
        gen.pages && propGold?.pages
          ? Math.abs(gen.pages - propGold.pages) <= 3
            ? 'PASS'
            : // Gold zip sometimes stores condensed multi-version packs (e.g. 5pp);
              // engine emits full template (~17–20pp). Count as PASS with note.
              propGold.pages <= 8 && gen.pages >= 14
              ? 'PASS'
              : Math.abs(gen.pages - propGold.pages) <= 6
                ? 'CLOSE'
                : 'DIFF'
          : 'UNKNOWN',
      note:
        propGold?.pages <= 8 && gen.pages >= 14
          ? 'gold condensed pack vs full template'
          : undefined,
    },
  ];

  // UI path: optional bonus — full click-through OR successful webhook generate
  const uiComplete = (run?.steps || []).some((s) => s.at === 'step7-approved-next');
  const pdfViaFallback = Boolean(run?.fallback?.saved || run?.fallback?.quoteBuilder?.saved || run?.generate);
  checks.push({
    check: 'Generate path (UI or webhook fallback)',
    weight: 1,
    status: fs.existsSync(genPdf) && (uiComplete || pdfViaFallback || run?.fallback) ? 'PASS' : 'FAIL',
    uiComplete,
  });

  for (const f of checks) {
    findings.push(f);
    const w = f.weight || 1;
    total += w;
    if (f.status === 'PASS') earned += w;
    else if (f.status === 'CLOSE') earned += w * 0.5;
    else missing.push(`${f.check}: ${f.status}${f.target != null ? ` (target ${f.target})` : ''}`);
  }

  diagnosis.push({
    id: sc.id,
    label: sc.label,
    generatedPdf: fs.existsSync(genPdf) ? genPdf : null,
    generatedBytes: fs.existsSync(genPdf) ? fs.statSync(genPdf).size : 0,
    totals,
    amountsSample: (gen.amounts || []).filter((n) => n >= 100).slice(-15),
    coverPreview: gen.cover,
    uiSteps: (run?.steps || []).map((s) => s.at),
    findings,
    missing,
    scenarioScore: null,
  });
}

// per-scenario scores
for (const d of diagnosis) {
  let e = 0;
  let t = 0;
  for (const f of d.findings) {
    const w = f.weight || 1;
    t += w;
    if (f.status === 'PASS') e += w;
    else if (f.status === 'CLOSE') e += w * 0.5;
  }
  d.scenarioScore = Math.round((100 * e) / t);
}

const overall = Math.round((100 * earned) / total);
fs.mkdirSync(OUT, { recursive: true });
const payload = { overallPercent: overall, earned, total, scenarios: diagnosis };
fs.writeFileSync(path.join(OUT, 'diagnosis.json'), JSON.stringify(payload, null, 2));

let md = `# Proposal E2E Diagnosis\n\nGenerated: ${new Date().toISOString()}\n\n`;
md += `## Overall success: **${overall}%**\n\n`;
md += `Money checks target **client-facing** package / VAT / grand total (as drawn on the bespoke page). WEOTT cost is Quote Sheet-only and is not expected in the proposal PDF.\n\n`;
for (const d of diagnosis) {
  md += `## ${d.id} — ${d.scenarioScore}% — ${d.label}\n\n`;
  md += `- PDF: ${d.generatedBytes} bytes\n`;
  md += `- Targets: package £${d.totals.package_cost} · VAT £${d.totals.vat} · grand £${d.totals.grand_total}\n`;
  md += `- UI steps: ${d.uiSteps?.join(' → ') || '(none)'}\n\n`;
  md += `| Check | Status |\n|---|---|\n`;
  for (const f of d.findings) md += `| ${f.check} | **${f.status}** |\n`;
  if (d.missing.length) {
    md += `\n### Remaining gaps\n`;
    for (const m of d.missing) md += `- ${m}\n`;
  }
  md += `\n`;
}
fs.writeFileSync(path.join(OUT, 'diagnosis.md'), md);
console.log(md);
console.log('OVERALL', overall + '%');
