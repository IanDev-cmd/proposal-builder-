import json
from pathlib import Path

p = Path(__file__).with_name("n8n-quote-builder-mvp.json")
wf = json.loads(p.read_text(encoding="utf-8"))

normalize_code = r"""const body = $input.first().json.body || $input.first().json;
const upgrades = Array.isArray(body.selectedUpgrades) ? body.selectedUpgrades.join(', ') : (body.selectedUpgrades || '');
const inserts = Array.isArray(body.selectedInserts) ? body.selectedInserts.join(', ') : (body.selectedInserts || '');
const lineLabels = Array.isArray(body.selectedLineLabels) ? body.selectedLineLabels.join(' | ') : (body.selectedLineLabels || '');
const sectionTotals = body.sectionTotals && typeof body.sectionTotals === 'object' ? JSON.stringify(body.sectionTotals) : (body.sectionTotals || '');
return [{ json: {
  mode: body.mode === 'live' ? 'live' : 'demo',
  referenceNumber: body.referenceNumber || '',
  email: body.email || '',
  leadName: body.leadName || '',
  quoteId: body.quoteId || '',
  status: body.status || '',
  version: body.version || body.quoteVersion || '',
  title: body.title || '',
  eventType: body.eventType || '',
  eventDate: body.eventDate || '',
  guestCount: body.guestCount || body.guests || '',
  guestCountHigh: body.guestCountHigh || '',
  repeatClient: body.repeatClient === true ? 'YES' : (body.repeatClient === false ? 'NO' : ''),
  agentReferral: body.agentReferral === true ? 'YES' : (body.agentReferral === false ? 'NO' : ''),
  selectedUpgrades: upgrades,
  selectedLineLabels: lineLabels,
  keyItems: body.keyItems || '',
  weeklyPeriod: body.weeklyPeriod || '',
  dayPeriod: body.dayPeriod || '',
  groupBracket: body.groupBracket || '',
  noOfTables: body.noOfTables || '',
  templateId: body.templateId || body.template_id || '',
  selectedInserts: inserts,
  staffContact: body.staffContact || '',
  baseCost: body.baseCost ?? '',
  subtotalBeforeContingency: body.subtotalBeforeContingency ?? '',
  contingency: body.contingency ?? '',
  margin: body.margin ?? '',
  marginAmount: body.marginAmount ?? '',
  discountPercent: body.discountPercent ?? '',
  discountAmount: body.discountAmount ?? '',
  commissionPercent: body.commissionPercent ?? '',
  commissionAmount: body.commissionAmount ?? '',
  updatedProfit: body.updatedProfit ?? '',
  costPerGuestExc: body.costPerGuestExc ?? '',
  costPerGuestInc: body.costPerGuestInc ?? '',
  costToClient: body.costToClient ?? body.packageCost ?? '',
  packageCost: body.packageCost ?? body.costToClient ?? '',
  vat: body.vat ?? '',
  upgradeTotal: body.upgradeTotal ?? '',
  grandTotal: body.grandTotal ?? '',
  sectionTotals,
  updatedAt: new Date().toISOString(),
}}];"""

assemble_code = r"""// Return raw rows + structured Cost Mother when parseable.
// UI uses bundled Cost Mother snapshot and overlays `costMother` when present.
function rows(name) {
  let all = [];
  try { all = $(name).all().map((i) => i.json || {}); } catch (e) { all = []; }
  return all.filter((r) => Object.keys(r).length && Object.values(r).some((v) => String(v ?? '').trim() !== ''));
}

function structureCostMother(raw) {
  if (raw.length && raw[0] && raw[0].label && raw[0].rates && typeof raw[0].rates === 'object') {
    return {
      source: 'Cost Mother Read (shaped)',
      items: raw.map((r) => ({ row: r.row || 0, label: String(r.label), rates: r.rates })),
    };
  }
  const items = [];
  for (const r of raw) {
    if (r.label && r.rates) {
      items.push({ row: Number(r.row) || 0, label: String(r.label), rates: r.rates });
    }
  }
  if (items.length >= 10) return { source: 'Cost Mother Read', items };
  return null;
}

const vesselRates = rows('Price Comparison Read');
const cateringRates = rows('Cost Mother Read');
const quoteBuilder2026 = rows('QuoteBuilder Tab');
const margins = rows('Minimum Margin Read');
const staffRatios = rows('Ratios');
const cutleryRatios = rows('cutlery Ratios');
const costMother = structureCostMother(cateringRates);

return [{ json: {
  ok: true,
  source: 'live',
  note: costMother
    ? 'Structured costMother available; UI will overlay bundled rates.'
    : 'Raw Cost Mother rows returned; UI uses bundled Cost Mother snapshot (Quote Builder 2026 parity) until Sheets headers are shaped.',
  vesselRates,
  cateringRates,
  costMother,
  quoteBuilder2026,
  margins,
  staffRatios,
  cutleryRatios,
  counts: {
    vesselRates: vesselRates.length,
    cateringRates: cateringRates.length,
    costMotherItems: costMother ? costMother.items.length : 0,
    quoteBuilder2026: quoteBuilder2026.length,
    margins: margins.length,
    staffRatios: staffRatios.length,
    cutleryRatios: cutleryRatios.length,
  },
}}];"""

quote_columns = {
    "Updated At": "={{ $json.updatedAt }}",
    "Mode": "={{ $json.mode }}",
    "Reference": "={{ $json.referenceNumber }}",
    "Email": "={{ $json.email }}",
    "Lead Name": "={{ $json.leadName }}",
    "Quote Id": "={{ $json.quoteId }}",
    "Status": "={{ $json.status }}",
    "Version": "={{ $json.version }}",
    "Title": "={{ $json.title }}",
    "Event Type": "={{ $json.eventType }}",
    "Event Date": "={{ $json.eventDate }}",
    "Guests": "={{ $json.guestCount }}",
    "Guests High": "={{ $json.guestCountHigh }}",
    "Repeat Client": "={{ $json.repeatClient }}",
    "Agent Referral": "={{ $json.agentReferral }}",
    "Key Items": "={{ $json.keyItems }}",
    "Weekly Period": "={{ $json.weeklyPeriod }}",
    "Day Period": "={{ $json.dayPeriod }}",
    "Group Bracket": "={{ $json.groupBracket }}",
    "No Of Tables": "={{ $json.noOfTables }}",
    "Selected Upgrades": "={{ $json.selectedUpgrades }}",
    "Selected Cost Lines": "={{ $json.selectedLineLabels }}",
    "Template Id": "={{ $json.templateId }}",
    "Selected Inserts": "={{ $json.selectedInserts }}",
    "Staff Contact": "={{ $json.staffContact }}",
    "Subtotal Pre Contingency": "={{ $json.subtotalBeforeContingency }}",
    "Base Cost": "={{ $json.baseCost }}",
    "Contingency": "={{ $json.contingency }}",
    "Margin": "={{ $json.margin }}",
    "Margin Amount": "={{ $json.marginAmount }}",
    "Discount %": "={{ $json.discountPercent }}",
    "Discount Amount": "={{ $json.discountAmount }}",
    "Commission %": "={{ $json.commissionPercent }}",
    "Commission Amount": "={{ $json.commissionAmount }}",
    "Updated Profit": "={{ $json.updatedProfit }}",
    "Cost Per Guest Exc": "={{ $json.costPerGuestExc }}",
    "Cost Per Guest Inc": "={{ $json.costPerGuestInc }}",
    "Cost To Client": "={{ $json.costToClient }}",
    "Package Cost": "={{ $json.packageCost }}",
    "VAT": "={{ $json.vat }}",
    "Upgrade Total": "={{ $json.upgradeTotal }}",
    "Grand Total": "={{ $json.grandTotal }}",
    "Section Totals": "={{ $json.sectionTotals }}",
}

for node in wf["nodes"]:
    name = node.get("name")
    if name == "Normalize QuoteStatus1":
        node["parameters"]["jsCode"] = normalize_code
    elif name == "Assemble Rates":
        node["parameters"]["jsCode"] = assemble_code
    elif name in ("Append Quote LIVE1", "Append Quote DEMO1"):
        node["parameters"]["columns"]["value"] = quote_columns
    elif name == "Transform QuoteBuilder1":
        code = node["parameters"]["jsCode"]
        needle = "addIfPresent(leadOut, 'guest_range', form.guestCount || raw.guestCount || lead.groupSize);"
        inject = """const guestLow = form.guestCount || raw.guestCount || lead.groupSize;
const guestHigh = form.guestCountHigh || raw.guestCountHigh || '';
const guestRange = (guestHigh && String(guestHigh).trim()) ? (String(guestLow || '') + '-' + String(guestHigh)) : (guestLow || '');
addIfPresent(leadOut, 'guest_range', guestRange);
addIfPresent(leadOut, 'quote_version', form.quoteVersion || raw.quoteVersion || raw.version);
addIfPresent(leadOut, 'key_items', form.keyItems || raw.keyItems);
addIfPresent(leadOut, 'weekly_period', form.weeklyPeriod || raw.weeklyPeriod);
addIfPresent(leadOut, 'day_period', form.dayPeriod || raw.dayPeriod);
addIfPresent(leadOut, 'group_bracket', form.groupBracket || raw.groupBracket);
addIfPresent(leadOut, 'no_of_tables', form.noOfTables || raw.noOfTables);"""
        if needle in code and "guestCountHigh" not in code:
            code = code.replace(needle, inject)
            node["parameters"]["jsCode"] = code

p.write_text(json.dumps(wf, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("patched", p)

wf2 = json.loads(p.read_text(encoding="utf-8"))
norm = next(n for n in wf2["nodes"] if n["name"] == "Normalize QuoteStatus1")
asm = next(n for n in wf2["nodes"] if n["name"] == "Assemble Rates")
tr = next(n for n in wf2["nodes"] if n["name"] == "Transform QuoteBuilder1")
print("normalize ok", "costPerGuestInc" in norm["parameters"]["jsCode"])
print("assemble ok", "costMother" in asm["parameters"]["jsCode"])
print("transform ok", "guestCountHigh" in tr["parameters"]["jsCode"])
