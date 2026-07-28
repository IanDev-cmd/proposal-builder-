/**
 * Deterministic Proposal Agent (no AI)
 * - Injects saved lead fixtures (LeadDataFetch often empty on Demo)
 * - Clicks through Quote Builder steps using ui-index.json
 * - Generates PDF via UI → harmonylove QuoteBuilder webhook
 * - Falls back to direct QuoteBuilder / proposal-engine /generate if UI/webhook fails
 * - Writes outputs + run report under ./output/
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const OUT = path.join(ROOT, 'output');
const APP = process.env.APP_BASE || 'http://localhost:5173';
const N8N = 'https://harmonylove.app.n8n.cloud/webhook';
const PDF_ENGINE = 'https://weott-proposal-engine.onrender.com/generate';

const ui = JSON.parse(fs.readFileSync(path.join(ROOT, 'ui-index.json'), 'utf8'));
const scenarios = JSON.parse(fs.readFileSync(path.join(ROOT, 'scenarios.json'), 'utf8'));
const GOLD_FINANCIAL = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, '../../artifacts/workspace-suite/src/lib/assets/goldFinancialScenarios.json'),
    'utf8',
  ),
);
const GOLD_PACKAGE_WORDING = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, '../../artifacts/workspace-suite/src/lib/assets/goldPackageWording.json'),
    'utf8',
  ),
);

/** When true (default), rely on lead prefill + confirm clicks instead of manual form fill. */
const PREFILL_MODE = process.env.PREFILL_MODE !== '0';

fs.mkdirSync(OUT, { recursive: true });

function log(...args) {
  const line = `[agent] ${args.map(String).join(' ')}`;
  console.log(line);
  fs.appendFileSync(path.join(OUT, 'agent.log'), line + '\n');
}

function loadLead(rel) {
  const p = path.resolve(ROOT, rel);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function toQuoteLead(raw, idx) {
  const name = raw.name || 'Lead';
  const initials = name
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
  return {
    id: idx + 1,
    name,
    email: (raw.email || '').split('/')[0].trim(),
    phone: raw.phone || '',
    designation: raw.jobRole || '',
    company: raw.companyName || '',
    referenceNumber: raw.referenceNumber || '',
    initials: initials || 'WE',
    color: '#FF5A45',
    source: raw.source,
    companySector: raw.companySector,
    budget: raw.budget,
    repeatClient: raw.repeatClient,
    preparedBy: raw.preparedBy,
    assignedRep: raw.assignedRep,
    status: raw.status,
    liveDead: raw.liveDead,
    enquiryDate: raw.enquiryDate,
    eventType: raw.eventType,
    fullEventDate: raw.fullEventDate,
    eventDateFlexible: raw.eventDateFlexible,
    eventDateFlexibleBool: raw.eventDateFlexibleBool,
    eventDateDisplay: raw.eventDateDisplay,
    requestedEventTimes: raw.requestedEventTimes,
    groupSize: raw.groupSize,
    groupSizeQuote: raw.groupSizeQuote,
    vessels: raw.vessels,
    market: raw.market,
    bestTimeToCall: raw.bestTimeToCall,
    yearOfEvent: raw.yearOfEvent,
    progressNotes: raw.progressNotes,
    sapphire: raw,
  };
}

async function clickOpenSelect(page, labelSubstring) {
  // Custom dropdown: button near label text
  const btn = page.locator('label', { hasText: labelSubstring }).locator('..').locator('button').first();
  if (await btn.count()) {
    await btn.click();
    return true;
  }
  return false;
}

async function pickOption(page, optionText) {
  const opt = page.locator('li', { hasText: optionText }).first();
  await opt.waitFor({ state: 'visible', timeout: 8000 });
  await opt.click();
}

async function setNativeSelectByLabel(page, labelText, value) {
  const label = page.locator('label', { hasText: labelText }).first();
  const select = label.locator('xpath=following::select[1]').first();
  if (await select.count()) {
    await select.selectOption({ label: value }).catch(async () => {
      await select.selectOption(value);
    });
    return true;
  }
  return false;
}

async function fillByLabel(page, labelText, value, kind = 'input') {
  const label = page.locator('label', { hasText: labelText }).first();
  const input = label.locator(`xpath=following::${kind}[1]`).first();
  if (await input.count()) {
    await input.fill(String(value));
    return true;
  }
  return false;
}

async function clickNext(page) {
  const next = page.locator('[data-testid=btn-next]');
  if (await next.count()) {
    await next.click();
    return;
  }
  await page.getByRole('button', { name: /^Next$|Continue to Proposal Pack|Approve to continue/ }).click();
}

async function ensureToggleOn(page, titleText, shouldOn) {
  // Toggle rows have title + button switch
  const row = page.locator('div', { hasText: titleText }).filter({ has: page.locator('button.relative') }).first();
  if (!(await row.count())) return;
  const btn = row.locator('button.relative').first();
  const cls = (await btn.getAttribute('class')) || '';
  const isOn = cls.includes('bg-[#FF5A45]') || cls.includes('bg-[#00e676]');
  if (Boolean(shouldOn) !== isOn) await btn.click();
}

async function selectMenu(page, menuLabel) {
  // Open menu picker if present
  const trigger = page.locator('label', { hasText: 'Menu Type' }).locator('..').locator('button').first();
  if (await trigger.count()) {
    await trigger.click();
    await page.waitForTimeout(300);
  }
  // Search box
  const search = page.locator('input[placeholder*="Search"]').first();
  if (await search.count()) {
    await search.fill(menuLabel.split('(')[0].trim());
    await page.waitForTimeout(200);
  }
  const opt = page.getByText(menuLabel, { exact: false }).first();
  if (await opt.count()) await opt.click();
  // close if needed
  await page.keyboard.press('Escape').catch(() => undefined);
}

async function toggleCostLines(page, labels) {
  for (const label of labels) {
    const row = page.locator('button', { hasText: label }).first();
    if (!(await row.count())) {
      // expand sections that might contain it
      const sections = page.locator('button', { hasText: 'Section' });
      const n = await sections.count();
      for (let i = 0; i < n; i++) {
        await sections.nth(i).click().catch(() => undefined);
      }
    }
    const btn = page.locator('button', { hasText: label }).first();
    if (!(await btn.count())) {
      log('WARN missing cost line UI:', label);
      continue;
    }
    const cls = (await btn.getAttribute('class')) || '';
    if (!cls.includes('bg-[#FFF1F0]')) await btn.click();
  }
}

async function setBespoke(page, items) {
  for (let i = 0; i < items.length; i++) {
    const amountInputs = page.locator('input[placeholder="£"]');
    if ((await amountInputs.count()) > i) {
      const labelInputs = page.locator('input[placeholder^="Bespoke"]');
      if ((await labelInputs.count()) > i && items[i].label) {
        await labelInputs.nth(i).fill(items[i].label);
      }
      await amountInputs.nth(i).fill(String(items[i].amount));
    }
  }
}

async function approveCost(page) {
  const overlayBtn = page.locator('[data-testid=btn-approve-cost-overlay]');
  if (await overlayBtn.count()) {
    await overlayBtn.click();
    await page.waitForTimeout(400);
    return;
  }
  const approve = page.locator('[data-testid=btn-approve-cost]').first();
  if (await approve.count()) {
    await approve.click();
    await page.waitForTimeout(400);
  }
}

async function confirmAllPrefill(page) {
  const btn = page.locator('[data-testid=btn-confirm-all-prefill]');
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(300);
    return true;
  }
  // Fallback: click each blue confirm control
  const confirms = page.getByText(/^Confirm$/);
  const n = await confirms.count();
  for (let i = 0; i < Math.min(n, 12); i++) {
    await confirms.nth(i).click().catch(() => undefined);
    await page.waitForTimeout(120);
  }
  return n > 0;
}

async function clickThroughPrefillSteps(page, dir, report) {
  await page.screenshot({ path: path.join(dir, '01-event-core.png'), fullPage: true });
  for (let s = 1; s <= 3; s++) {
    await clickNext(page);
    await page.waitForTimeout(350);
    report.steps.push({ ok: true, at: `prefill-step${s}-next` });
  }
  await page.screenshot({ path: path.join(dir, '04-cost-lines.png'), fullPage: true });
  await clickNext(page);
  await page.waitForTimeout(350);
  report.steps.push({ ok: true, at: 'prefill-step4-next' });
  await page.screenshot({ path: path.join(dir, '05-financials.png'), fullPage: true });
  await clickNext(page);
  await page.waitForTimeout(350);
  report.steps.push({ ok: true, at: 'prefill-step5-next' });
  // Step 6 — btn-next auto-approves when parity passes
  await clickNext(page);
  await page.waitForTimeout(400);
  report.steps.push({ ok: true, at: 'step6-approved-next' });
  await page.screenshot({ path: path.join(dir, '07-proposal-pack-entry.png'), fullPage: true });
}

async function fillScenarioManually(page, scenario, lead, dir, report) {
  const f = scenario.form;
  if (f.source) {
    if (await clickOpenSelect(page, 'Source')) await pickOption(page, f.source).catch(() => undefined);
  }
  if (f.vesselType?.[0]) {
    if (await clickOpenSelect(page, 'Vessel Type')) await pickOption(page, f.vesselType[0]);
    await page.keyboard.press('Escape').catch(() => undefined);
  }
  if (f.eventType) {
    if (await clickOpenSelect(page, 'Event Type')) await pickOption(page, f.eventType);
  }
  if (f.quoteVersion) await setNativeSelectByLabel(page, 'Quote version', f.quoteVersion);
  if (f.weeklyPeriod) await setNativeSelectByLabel(page, 'Weekly period', f.weeklyPeriod);
  if (f.dayPeriod) await setNativeSelectByLabel(page, 'Day period', f.dayPeriod);
  if (f.groupBracket) await setNativeSelectByLabel(page, 'Group bracket', f.groupBracket);
  if (f.keyItems) await fillByLabel(page, 'Key Items', f.keyItems);
  if (f.dateFlexible) await ensureToggleOn(page, 'Date flexible', true);
  if (!f.dateFlexible && f.eventDate) {
    await page.locator('input[type=date]').fill(f.eventDate).catch(() => undefined);
  }
  if (lead.progressNotes) {
    await fillByLabel(page, 'Call / progress notes', lead.progressNotes, 'textarea').catch(() => undefined);
  }
  await clickNext(page);
  report.steps.push({ ok: true, at: 'step1-next' });

  await fillByLabel(page, 'Guests (quote / lower)', f.guestCount);
  if (f.guestCountHigh) await fillByLabel(page, 'Guests high', f.guestCountHigh);
  if (f.noOfTables) await fillByLabel(page, 'No. of tables', f.noOfTables);
  await clickNext(page);
  report.steps.push({ ok: true, at: 'step2-next' });

  const times = [f.embarkation, f.departure, f.returnTime, f.disembarkation];
  const timeInputs = page.locator('input[type=time]');
  const tc = await timeInputs.count();
  for (let i = 0; i < Math.min(tc, times.length); i++) {
    if (times[i]) await timeInputs.nth(i).fill(times[i]);
  }
  await clickNext(page);
  report.steps.push({ ok: true, at: 'step3-next' });

  await toggleCostLines(page, f.costLineLabels || []);
  if (f.bespoke?.length) await setBespoke(page, f.bespoke);
  await page.screenshot({ path: path.join(dir, '04-cost-lines.png'), fullPage: true });
  await clickNext(page);
  report.steps.push({ ok: true, at: 'step4-next' });

  if (f.marginPercent) await fillByLabel(page, 'Margin %', f.marginPercent).catch(() => undefined);
  await page.screenshot({ path: path.join(dir, '05-financials.png'), fullPage: true });
  await clickNext(page);
  report.steps.push({ ok: true, at: 'step5-next' });

  await clickNext(page);
  report.steps.push({ ok: true, at: 'step6-approved-next' });
}

async function pickTemplate(page, templateId, category) {
  if (category === 'wedding') {
    await page.getByRole('button', { name: /^wedding$/i }).click().catch(() => undefined);
  } else {
    await page.getByRole('button', { name: /^corporate$/i }).click().catch(() => undefined);
  }
  await page.waitForTimeout(200);
  const select = page.locator('select').filter({ has: page.locator('option') }).first();
  // Prefer selecting by value = template id
  const ok = await select
    .selectOption(templateId)
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    // fallback: first non-empty option matching event words
    const options = await select.locator('option').allTextContents();
    log('template options', JSON.stringify(options.slice(0, 12)));
    await select.selectOption({ index: 1 }).catch(() => undefined);
  }
}

function buildFallbackPayload(scenario, lead) {
  const gold = GOLD_FINANCIAL[scenario.id];
  const f = gold?.form || scenario.form;
  const guests = Number(f.guestCount) || 0;
  const weott = scenario.goldQuoteWeottCost || gold?.goldQuoteWeottCost || 0;
  const marginPct = Number(f.marginPercent) || gold?.marginPercent || 25;
  const margin = marginPct / 100;
  const costToClient = Math.round(weott * (1 + margin) * 100) / 100;
  const vat = Math.round(costToClient * 0.2 * 100) / 100;
  const grand = Math.round((costToClient + vat) * 100) / 100;
  const packageWording = GOLD_PACKAGE_WORDING[scenario.id] || {};
  const selectedInserts = f.selectedInserts || [];
  return {
    mode: 'demo',
    event_type: f.eventType,
    category: f.proposalCategory,
    template_id: f.templateId,
    manual_template: true,
    selectedInserts,
    packageWording,
    vessel: f.vesselType?.[0],
    vessels: (f.vesselType || []).join(', '),
    nexusLead: lead,
    lead: {
      proposal_ref: lead.referenceNumber,
      client_name: lead.name,
      organisation: lead.companyName,
      telephone: lead.phone,
      email: (lead.email || '').split('/')[0].trim(),
      event_type: f.eventType,
      event_date: f.dateFlexible ? 'Date TBC' : f.eventDate || lead.eventDateDisplay,
      event_timings: `${f.embarkation} - ${f.disembarkation}`,
      guest_range: f.guestCountHigh ? `${f.guestCount}-${f.guestCountHigh}` : f.guestCount,
      guest_quote_n: String(guests),
      prepared_by: lead.preparedBy || lead.assignedRep || 'Natasha',
      contact_name: 'Katherine Bulaon',
      contact_title: 'Client Relationship Manager',
      contact_phone: '020 8323 5827',
      contact_email: 'sales@westendonthethames.com',
      budget: lead.budget,
      vessels: (f.vesselType || []).join(', '),
      market: lead.market,
      source: lead.source,
      year_of_event: lead.yearOfEvent,
      repeat_client: f.repeatClient ? 'YES' : 'NO',
      key_items: f.keyItems,
      quote_version: f.quoteVersion,
    },
    calculations: { guests, package_cost: costToClient, vat, grand_total: grand },
    selectedUpgrades: [],
    selectedUpgradeLabels: [],
    financials: {
      baseCost: weott,
      contingency: Math.round(weott * 0.0225 * 100) / 100,
      contingencyRate: 0.0225,
      margin,
      marginAmount: Math.round(weott * margin * 100) / 100,
      costToClient,
      vat,
      vatRate: 0.2,
      grandTotal: grand,
    },
    form: f,
    progressNotes: lead.progressNotes || '',
  };
}

async function postGenerate(url, payload, outPdf) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/pdf, application/json' },
    body: JSON.stringify(payload),
  });
  const ctype = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = { status: res.status, contentType: ctype, bytes: buf.length, url };
  if (!res.ok) {
    meta.errorBody = buf.toString('utf8').slice(0, 2000);
    return meta;
  }
  if (ctype.includes('pdf') || buf.slice(0, 4).toString() === '%PDF') {
    fs.writeFileSync(outPdf, buf);
    meta.saved = outPdf;
    return meta;
  }
  // try json wrappers
  try {
    const json = JSON.parse(buf.toString('utf8'));
    meta.jsonKeys = Object.keys(json);
    const b64 = json.pdfBase64 || json.pdf || json.file;
    if (typeof b64 === 'string' && b64.length > 100) {
      const raw = b64.replace(/^data:application\/pdf;base64,/, '');
      fs.writeFileSync(outPdf, Buffer.from(raw, 'base64'));
      meta.saved = outPdf;
    } else if (json.pdfUrl || json.url || json.fileUrl) {
      const u = json.pdfUrl || json.url || json.fileUrl;
      const r2 = await fetch(u);
      const b2 = Buffer.from(await r2.arrayBuffer());
      fs.writeFileSync(outPdf, b2);
      meta.saved = outPdf;
      meta.via = u;
    } else {
      fs.writeFileSync(outPdf.replace(/\.pdf$/, '.json'), JSON.stringify(json, null, 2));
      meta.savedJson = outPdf.replace(/\.pdf$/, '.json');
    }
  } catch {
    fs.writeFileSync(outPdf.replace(/\.pdf$/, '.bin'), buf);
    meta.savedBin = outPdf.replace(/\.pdf$/, '.bin');
  }
  return meta;
}

async function runScenario(browser, scenario, idx) {
  const dir = path.join(OUT, scenario.id);
  fs.mkdirSync(dir, { recursive: true });
  const report = {
    id: scenario.id,
    label: scenario.label,
    startedAt: new Date().toISOString(),
    steps: [],
    errors: [],
    generate: null,
    fallback: null,
  };
  const leadRaw = loadLead(scenario.leadFixture);
  const lead = toQuoteLead(leadRaw, idx);
  fs.writeFileSync(path.join(dir, 'lead.injected.json'), JSON.stringify(lead, null, 2));

  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // Capture webhook traffic
  const network = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('n8n.cloud') || u.includes('weott-proposal-engine') || u.includes('onrender.com')) {
      network.push({ url: u, status: res.status(), type: res.headers()['content-type'] || '' });
    }
  });

  try {
    await context.addInitScript(
      ({ leadObj, mode }) => {
        try {
          localStorage.setItem('nexus.sheetsMode', mode);
          sessionStorage.setItem('nexus.quoteLead', JSON.stringify(leadObj));
        } catch (_) {}
      },
      { leadObj: lead, mode: 'demo' },
    );

    await page.goto(`${APP}/quote-builder`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    report.steps.push({ ok: true, at: 'open-quote-builder', prefillMode: PREFILL_MODE });

    const f = scenario.form;

    if (PREFILL_MODE) {
      await clickThroughPrefillSteps(page, dir, report);
    } else {
      await page.screenshot({ path: path.join(dir, '01-event-core.png'), fullPage: true });
      await fillScenarioManually(page, scenario, lead, dir, report);
    }

    // Step 8 — confirm blue suggestions then generate
    await confirmAllPrefill(page);
    await page.screenshot({ path: path.join(dir, '08-proposal-pack.png'), fullPage: true });
    const outPdf = path.join(dir, `${scenario.id}.generated.pdf`);
    let gotPdf = false;

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }).catch(() => null),
      page.locator('[data-testid=btn-generate]').click().catch(async () => {
        await page.getByRole('button', { name: /Generate Proposal/i }).click();
      }),
    ]);

    if (download) {
      await download.saveAs(outPdf);
      gotPdf = fs.existsSync(outPdf) && fs.statSync(outPdf).size > 1000;
      report.generate = { via: 'download', bytes: gotPdf ? fs.statSync(outPdf).size : 0 };
    } else {
      // wait for overlay done / proposal doc
      await page.waitForTimeout(8000);
      await page.screenshot({ path: path.join(dir, '09-after-generate.png'), fullPage: true });
      // try localStorage proposals
      const stored = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        return keys.filter((k) => /proposal/i.test(k)).map((k) => ({ k, len: (localStorage.getItem(k) || '').length }));
      });
      report.generate = { via: 'ui-no-download', stored, network };
      // Attempt to pull data URL from proposal store if present
      const pdfData = await page.evaluate(() => {
        try {
          for (const k of Object.keys(localStorage)) {
            const v = localStorage.getItem(k);
            if (v && v.includes('data:application/pdf')) {
              const j = JSON.parse(v);
              const arr = Array.isArray(j) ? j : [j];
              for (const item of arr) {
                if (item?.pdfDataUrl?.startsWith('data:application/pdf')) return item.pdfDataUrl;
              }
            }
            if (v && v.startsWith('data:application/pdf')) return v;
          }
        } catch (_) {}
        return null;
      });
      if (pdfData) {
        const b64 = pdfData.replace(/^data:application\/pdf;base64,/, '');
        fs.writeFileSync(outPdf, Buffer.from(b64, 'base64'));
        gotPdf = true;
        report.generate.via = 'localStorage';
        report.generate.bytes = fs.statSync(outPdf).size;
      }
    }

    if (!gotPdf) {
      log(scenario.id, 'UI generate missed PDF — fallback webhooks');
      const payload = buildFallbackPayload(scenario, leadRaw);
      fs.writeFileSync(path.join(dir, 'fallback.payload.json'), JSON.stringify(payload, null, 2));
      let meta = await postGenerate(`${N8N}/QuoteBuilder`, payload, outPdf);
      report.fallback = { quoteBuilder: meta };
      if (!meta.saved) {
        meta = await postGenerate(PDF_ENGINE, payload, outPdf);
        report.fallback.pdfEngine = meta;
      }
      gotPdf = Boolean(meta.saved);
    }
  } catch (err) {
    report.errors.push(String(err?.stack || err));
    log(scenario.id, 'ERROR', err?.message || err);
    await page.screenshot({ path: path.join(dir, 'error.png'), fullPage: true }).catch(() => undefined);
    // hard fallback
    try {
      const payload = buildFallbackPayload(scenario, leadRaw);
      fs.writeFileSync(path.join(dir, 'fallback.payload.json'), JSON.stringify(payload, null, 2));
      const outPdf = path.join(dir, `${scenario.id}.generated.pdf`);
      let meta = await postGenerate(`${N8N}/QuoteBuilder`, payload, outPdf);
      if (!meta.saved) meta = await postGenerate(PDF_ENGINE, payload, outPdf);
      report.fallback = meta;
    } catch (e2) {
      report.errors.push('fallback: ' + String(e2?.message || e2));
    }
  }

  report.network = network;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'run-report.json'), JSON.stringify(report, null, 2));
  await context.close();
  return report;
}

async function main() {
  fs.writeFileSync(path.join(OUT, 'agent.log'), '');
  log('APP', APP);
  log('PREFILL_MODE', PREFILL_MODE);
  log('scenarios', scenarios.length);

  // quick webhook probe
  for (const pathName of ['LeadDataFetch', 'QuoteBuilder']) {
    try {
      const r = await fetch(`${N8N}/${pathName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'demo', probe: true }),
      });
      const t = await r.text();
      log('probe', pathName, r.status, 'len', t.length);
      fs.writeFileSync(path.join(OUT, `probe-${pathName}.txt`), `status=${r.status}\n${t.slice(0, 4000)}`);
    } catch (e) {
      log('probe FAIL', pathName, e.message);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const summary = [];
  for (let i = 0; i < scenarios.length; i++) {
    log('==== RUN', scenarios[i].id);
    const rep = await runScenario(browser, scenarios[i], i);
    summary.push({
      id: rep.id,
      errors: rep.errors.length,
      generate: rep.generate,
      fallback: rep.fallback,
    });
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  log('DONE summary written');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
