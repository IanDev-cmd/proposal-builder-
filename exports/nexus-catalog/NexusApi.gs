/**
 * WEOTT Nexus API — Sheets web app (doGet / doPost)
 * -------------------------------------------------
 * Paste as a NEW file next to Code.gs / Sentry.gs / Extras.gs.
 * Suggested name in the Apps Script editor: NexusApi.gs
 *
 * Does NOT replace buildNexusCatalog. Does not call Gemini, n8n, or Flask.
 * Catalog rebuild stays on buildNexusCatalog triggers; this file only READs
 * the prebuilt "_Nexus Catalog" tab (CostRatesFetch).
 *
 * Deploy (required before the React UX can call it):
 *   1. Extensions → Apps Script on the production workbook
 *      (1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o — openById, not getActive).
 *   2. Paste this file. Save.
 *   3. Deploy → New deployment → Type: Web app
 *        Execute as: Me
 *        Who has access: Anyone  (matches the previous unauthenticated n8n webhooks)
 *   4. Copy the /exec URL.
 *   5. Paste it into artifacts/workspace-suite/src/lib/backendUrls.ts
 *      as APPS_SCRIPT_WEBAPP_URL.
 *
 * Browser CORS:
 *   Apps Script POST with application/json preflights and 302s to
 *   googleusercontent — that fails from a Vite SPA. The UX therefore:
 *     - GET for reads (LeadDataFetch, CostRatesFetch, NotesFetch, QuotesFetch, health)
 *     - POST with Content-Type: text/plain (JSON body) for writes
 *   Both doGet and doPost are implemented. Follow redirects.
 *
 * Single workbook (no demo/live split):
 *   1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o
 *
 * Ops tables (Id is the primary key; Mode is not used):
 *   Nexus Ops Notes   — NoteAppend / NotesFetch
 *   Nexus Ops Quotes  — QuoteStatus / QuotesFetch
 */

var NEXUS_WORKBOOK_ID = '1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o';

var ENQUIRY_TAB = 'Enquiry - Lead Data (2026)';
var CATALOG_TAB = '_Nexus Catalog';
var NOTES_TAB = 'Nexus Ops Notes';
var QUOTES_TAB = 'Nexus Ops Quotes';

var NOTES_HEADERS = [
  'Id',
  'Created At',
  'Reference',
  'Email',
  'Lead Name',
  'Tag',
  'Note',
];

var QUOTES_HEADERS = [
  'Id',
  'Updated At',
  'Reference',
  'Email',
  'Lead Name',
  'Quote Id',
  'Status',
  'Version',
  'Title',
  'Event Type',
  'Event Date',
  'Guests',
  'Guests High',
  'Repeat Client',
  'Agent Referral',
  'Key Items',
  'Weekly Period',
  'Day Period',
  'Group Bracket',
  'No Of Tables',
  'Selected Upgrades',
  'Selected Cost Lines',
  'Template Id',
  'Selected Inserts',
  'Staff Contact',
  'Subtotal Pre Contingency',
  'Base Cost',
  'Contingency',
  'Margin',
  'Margin Amount',
  'Discount %',
  'Discount Amount',
  'Commission %',
  'Commission Amount',
  'Updated Profit',
  'Cost Per Guest Exc',
  'Cost Per Guest Inc',
  'Cost To Client',
  'Package Cost',
  'VAT',
  'Upgrade Total',
  'Grand Total',
  'Section Totals',
];

/** Port of n8n Structure all Leads1 header prefixes → Sapphire aliases. */
var LEAD_WANTED = [
  ['Client Reference Number', 'referenceNumber'],
  ['Name', 'name'],
  ['Company Name', 'companyName'],
  ['Company Sector', 'companySector'],
  ['Main Contact - Email', 'email'],
  ['Main Contact - Number', 'phone'],
  ['Main Contact - Job Role', 'jobRole'],
  ['Budget', 'budget'],
  ['Repeat Client', 'repeatClient'],
  ['Client Relationship Representative', 'preparedBy'],
  ['Status', 'status'],
  ['Live/Dead', 'liveDead'],
  ['Source', 'source'],
  ['Enquiry Date', 'enquiryDate'],
  ['Event Type', 'eventType'],
  ['Full Event Date', 'fullEventDate'],
  ['Event Date - Flexible', 'eventDateFlexible'],
  ['Requested Event Times', 'requestedEventTimes'],
  ['Group Size', 'groupSize'],
  ['What vessel', 'vessels'],
  ['Market', 'market'],
  ['Best time to call', 'bestTimeToCall'],
  ['Year of Event', 'yearOfEvent'],
];

function doGet(e) {
  return jsonOut_(route_(parseRequest_(e, 'GET')));
}

function doPost(e) {
  return jsonOut_(route_(parseRequest_(e, 'POST')));
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseRequest_(e, method) {
  var param = (e && e.parameter) || {};
  var raw = '';
  var body = null;
  var parseError = false;
  if (e && e.postData && e.postData.contents != null) {
    raw = String(e.postData.contents);
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch (err) {
        parseError = true;
      }
    }
  }
  var merged = {};
  var k;
  for (k in param) {
    if (Object.prototype.hasOwnProperty.call(param, k)) merged[k] = param[k];
  }
  if (body && typeof body === 'object') {
    for (k in body) {
      if (Object.prototype.hasOwnProperty.call(body, k)) merged[k] = body[k];
    }
  }
  merged._method = method;
  merged._parseError = parseError;
  merged._emptyBody = method === 'POST' && !String(raw).trim() && !param.action;
  return merged;
}

function route_(req) {
  var action = String(req.action || '').trim();
  if (req._parseError) {
    return failure_('NexusApi', 'empty or non-JSON request body', 400);
  }
  if (!action) {
    if (req._emptyBody || req._method === 'POST') {
      return failure_('LeadDataFetch', 'empty or non-JSON request body', 400);
    }
    return { ok: true, service: 'NexusApi', actions: ['health', 'LeadDataFetch', 'CostRatesFetch', 'NoteAppend', 'NotesFetch', 'QuoteStatus', 'QuotesFetch'] };
  }
  if (action === 'health') {
    return { ok: true, service: 'NexusApi' };
  }
  try {
    if (action === 'LeadDataFetch') return handleLeadDataFetch_(req);
    if (action === 'CostRatesFetch') return handleCostRatesFetch_(req);
    if (action === 'NoteAppend') return handleNoteAppend_(req);
    if (action === 'NotesFetch') return handleNotesFetch_(req);
    if (action === 'QuoteStatus') return handleQuoteStatus_(req);
    if (action === 'QuotesFetch') return handleQuotesFetch_(req);
    return failure_('NexusApi', 'Unknown action: ' + action, 404);
  } catch (err) {
    return failure_(action || 'NexusApi', String(err && err.message ? err.message : err), 500);
  }
}

function failure_(source, reason, httpStatus) {
  return {
    ok: false,
    failureEvent: {
      type: 'FailureEvent',
      source: source,
      reason: String(reason || 'unknown'),
      httpStatus: httpStatus || 500,
    },
  };
}

/** Never use getActive() — the web app has no active spreadsheet. */
function openWorkbook_() {
  return SpreadsheetApp.openById(NEXUS_WORKBOOK_ID);
}

function newId_() {
  return Utilities.getUuid();
}

function findTab_(ss, exactName, re) {
  var exact = ss.getSheetByName(exactName);
  if (exact) return exact;
  if (!re) return null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (re.test(sheets[i].getName())) return sheets[i];
  }
  return null;
}

function norm_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * LeadDataFetch — production enquiry tab only.
 */
function handleLeadDataFetch_(req) {
  if (req._emptyBody && req._method === 'POST') {
    return failure_('LeadDataFetch', 'empty or non-JSON request body', 400);
  }
  var ss = openWorkbook_();
  var sheet = findTab_(ss, ENQUIRY_TAB, /enquiry.*lead/i);
  if (!sheet) {
    return failure_('LeadDataFetch', 'Enquiry tab not found', 404);
  }
  var leads = structureLeads_(sheet);
  return { ok: true, count: leads.length, leads: leads };
}

/** Port of n8n Structure all Leads1 — do not rewrite Sapphire aliases. */
function structureLeads_(sheet) {
  var values = sheet.getDisplayValues();
  if (!values || values.length < 2) return [];
  var headers = values[0];
  var leads = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c] || '').trim();
      if (!h) continue;
      row[h] = values[r][c];
    }
    var out = mapLeadRow_(row);
    if (out.referenceNumber || out.name || out.email) leads.push(out);
  }
  leads.reverse(); // newest first (same as n8n)
  return leads;
}

function pickPrefix_(row, prefix) {
  var target = norm_(prefix);
  var keys = Object.keys(row);
  for (var i = 0; i < keys.length; i++) {
    if (norm_(keys[i]).indexOf(target) === 0) {
      var v = row[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return row[keys[i]];
    }
  }
  return '';
}

function lowerBound_(g) {
  var m = String(g).match(/\d+/);
  return m ? Number(m[0]) : '';
}

function collectProgress_(row) {
  var entries = [];
  var keys = Object.keys(row);
  for (var i = 0; i < keys.length; i++) {
    var mm = norm_(keys[i]).match(/^progress\s+(\d+)$/);
    if (mm) {
      var v = row[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        entries.push([Number(mm[1]), String(row[keys[i]]).trim()]);
      }
    }
  }
  entries.sort(function (a, b) { return a[0] - b[0]; });
  return entries.map(function (e) { return e[1]; }).join(' | ');
}

function isFlexible_(v) {
  var s = norm_(v);
  return s.indexOf('yes') >= 0 || s.indexOf('tbc') >= 0 || s.indexOf('flex') >= 0;
}

function mapLeadRow_(row) {
  var out = {};
  for (var i = 0; i < LEAD_WANTED.length; i++) {
    out[LEAD_WANTED[i][1]] = pickPrefix_(row, LEAD_WANTED[i][0]);
  }
  out.assignedRep = out.preparedBy;
  out.groupSizeQuote = lowerBound_(out.groupSize);
  out.progressNotes = collectProgress_(row);
  out.eventDateFlexibleBool = isFlexible_(out.eventDateFlexible);
  out.eventDateDisplay = out.eventDateFlexibleBool ? 'Date TBC' : (out.fullEventDate || '');
  return out;
}

/**
 * CostRatesFetch — ALWAYS the LIVE workbook _Nexus Catalog.
 * Mode is ignored for which catalog to read (rates are live by design).
 * Port of n8n Parse Catalog. Does not rebuild Cost Mother.
 */
function handleCostRatesFetch_(req) {
  var ss = SpreadsheetApp.openById(NEXUS_WORKBOOK_ID);
  var sheet = ss.getSheetByName(CATALOG_TAB);
  if (!sheet) {
    return emptyCatalog_('Catalog tab missing — run buildNexusCatalog in Apps Script.');
  }
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return emptyCatalog_('Catalog tab empty — run buildNexusCatalog in Apps Script.');
  }
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var any = false;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = values[r][c];
      obj[headers[c]] = v;
      if (v !== undefined && v !== null && String(v).trim() !== '') any = true;
    }
    if (any) rows.push(obj);
  }
  return parseCatalog_(rows);
}

function emptyCatalog_(note) {
  return {
    ok: false,
    source: 'workbook',
    note: note,
    failureEvent: {
      type: 'FailureEvent',
      source: 'CostRatesFetch',
      reason: 'Catalog tab empty',
      httpStatus: 422,
    },
    costMother: null,
    lines: [],
    vessels: [],
    periods: { weekly: [], day: [], group: [] },
    margins: [],
    staffRatios: [],
    cutleryRatios: [],
    counts: {
      costMotherItems: 0,
      lines: 0,
      catalogRows: 0,
      margins: 0,
      staffRatios: 0,
      cutleryRatios: 0,
    },
  };
}

function catalogCell_(row, names) {
  var keys = Object.keys(row || {});
  for (var i = 0; i < names.length; i++) {
    var want = names[i];
    if (row[want] !== undefined && row[want] !== null && String(row[want]).trim() !== '') return row[want];
    for (var k = 0; k < keys.length; k++) {
      if (String(keys[k]).toLowerCase() === String(want).toLowerCase()) {
        var hit = keys[k];
        if (row[hit] !== undefined && row[hit] !== null && String(row[hit]).trim() !== '') return row[hit];
      }
    }
  }
  return '';
}

function slugId_(section, label) {
  var s = String(section + ':' + label).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  s = s.replace(/^_|_$/g, '');
  return s.slice(0, 80);
}

/** Port of n8n Parse Catalog — kind/label/rateKey/rate → costMother + lines + margins + ratios. */
function parseCatalog_(rows) {
  var itemsByLabel = {};
  var itemOrder = [];
  var lines = [];
  var vessels = {};
  var periods = { weekly: {}, day: {}, group: {} };
  var marginCells = [];
  var staffRatios = [];
  var cutleryRatios = [];
  var monthRe = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var kind = String(catalogCell_(r, ['kind', 'Kind']) || 'rate').toLowerCase();
    var label = String(catalogCell_(r, ['label', 'Label']) || '').trim();
    if (kind === 'vessel') {
      if (label) vessels[label] = true;
      continue;
    }
    if (kind === 'line') {
      if (!label) continue;
      var section = String(catalogCell_(r, ['section', 'Section']) || 'other');
      var multiplier = String(catalogCell_(r, ['multiplier', 'Multiplier']) || 'set');
      lines.push({ id: slugId_(section, label), section: section, label: label, multiplier: multiplier });
      continue;
    }
    if (kind === 'margin') {
      var market = String(catalogCell_(r, ['section', 'Section']) || '').trim();
      var month = String(catalogCell_(r, ['rateKey', 'Rate Key', 'rate_key']) || '').trim().toUpperCase().slice(0, 3);
      var mrate = Number(catalogCell_(r, ['rate', 'Rate']));
      if (!label || !monthRe.test(month) || !isFinite(mrate)) continue;
      marginCells.push({ eventService: label, market: market, month: month, rate: mrate });
      continue;
    }
    if (kind === 'staff_ratio' || kind === 'cutlery_ratio') {
      var rec = {
        label: label,
        group: String(catalogCell_(r, ['section', 'Section']) || '').trim(),
        key: String(catalogCell_(r, ['rateKey', 'Rate Key', 'rate_key']) || '').trim(),
        value: Number(catalogCell_(r, ['rate', 'Rate'])),
      };
      if (!label || !isFinite(rec.value)) continue;
      if (kind === 'staff_ratio') staffRatios.push(rec);
      else cutleryRatios.push(rec);
      continue;
    }
    var rateKey = String(catalogCell_(r, ['rateKey', 'Rate Key', 'rate_key']) || '').trim();
    var rate = Number(catalogCell_(r, ['rate', 'Rate']));
    if (!label || !rateKey || !isFinite(rate)) continue;
    if (!itemsByLabel[label]) {
      itemsByLabel[label] = { row: itemOrder.length + 1, label: label, rates: {} };
      itemOrder.push(label);
    }
    itemsByLabel[label].rates[rateKey] = rate;
    var parts = rateKey.split('|');
    if (parts[0]) vessels[parts[0]] = true;
    if (parts[1]) periods.weekly[parts[1]] = true;
    if (parts[2]) periods.day[parts[2]] = true;
    if (parts[3]) periods.group[parts[3]] = true;
  }

  var marginMap = {};
  var marginOrder = [];
  for (var c = 0; c < marginCells.length; c++) {
    var cell = marginCells[c];
    var mk = cell.eventService + '||' + cell.market;
    if (!marginMap[mk]) {
      marginMap[mk] = { eventService: cell.eventService, market: cell.market, months: {} };
      marginOrder.push(mk);
    }
    marginMap[mk].months[cell.month] = cell.rate;
  }
  var margins = marginOrder.map(function (k) { return marginMap[k]; });
  var items = itemOrder.map(function (lab) { return itemsByLabel[lab]; });
  var costMother = items.length
    ? { source: '_Nexus Catalog', items: items }
    : null;
  if (costMother && margins.length) costMother.margins = margins;

  var vesselList = Object.keys(vessels);
  var out = {
    ok: Boolean(costMother),
    source: 'workbook',
    note: costMother
      ? 'Catalog from Apps Script (_Nexus Catalog).'
      : 'Catalog tab empty — run buildNexusCatalog in Apps Script.',
    costMother: costMother,
    lines: lines,
    vessels: vesselList,
    periods: {
      weekly: Object.keys(periods.weekly),
      day: Object.keys(periods.day),
      group: Object.keys(periods.group),
    },
    margins: margins,
    staffRatios: staffRatios,
    cutleryRatios: cutleryRatios,
    counts: {
      costMotherItems: items.length,
      lines: lines.length,
      catalogRows: rows.length,
      margins: margins.length,
      staffRatios: staffRatios.length,
      cutleryRatios: cutleryRatios.length,
    },
  };
  if (!costMother) {
    out.failureEvent = {
      type: 'FailureEvent',
      source: 'CostRatesFetch',
      reason: 'Catalog tab empty',
      httpStatus: 422,
    };
  }
  return out;
}

function handleNoteAppend_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = openWorkbook_();
    var sheet = ensureSheet_(ss, NOTES_TAB, NOTES_HEADERS);
    var note = {
      id: req.id || newId_(),
      createdAt: req.createdAt || new Date().toISOString(),
      referenceNumber: req.referenceNumber || '',
      email: req.email || '',
      leadName: req.leadName || '',
      tag: req.tag || '',
      note: req.note || '',
    };
    appendMappedRow_(sheet, {
      Id: note.id,
      'Created At': note.createdAt,
      Reference: note.referenceNumber,
      Email: note.email,
      'Lead Name': note.leadName,
      Tag: note.tag,
      Note: note.note,
    });
    SpreadsheetApp.flush();
    return { ok: true, note: note };
  } finally {
    lock.releaseLock();
  }
}

function handleNotesFetch_(req) {
  var ss = openWorkbook_();
  var sheet = ss.getSheetByName(NOTES_TAB);
  if (!sheet) return { ok: true, count: 0, notes: [] };
  var want = norm_(req.referenceNumber || req.reference || '');
  var notes = readMappedRows_(sheet).map(noteFromRow_).filter(function (n) {
    if (!n.id && !n.note) return false;
    if (!want) return true;
    return norm_(n.referenceNumber) === want;
  });
  return { ok: true, count: notes.length, notes: notes };
}

function yesNo_(v) {
  if (v === true) return 'YES';
  if (v === false) return 'NO';
  return '';
}

function joinList_(v, sep) {
  if (Object.prototype.toString.call(v) === '[object Array]') return v.join(sep);
  return v || '';
}

function handleQuoteStatus_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = openWorkbook_();
    var sheet = ensureSheet_(ss, QUOTES_TAB, QUOTES_HEADERS);
    var upgrades = joinList_(req.selectedUpgrades, ', ');
    var inserts = joinList_(req.selectedInserts, ', ');
    var lineLabels = joinList_(req.selectedLineLabels, ' | ');
    var sectionTotals = req.sectionTotals;
    if (sectionTotals && typeof sectionTotals === 'object') {
      sectionTotals = JSON.stringify(sectionTotals);
    }
    var quoteId = req.id || newId_();
    var updatedAt = new Date().toISOString();
    var rowByHeader = {};
    rowByHeader['Id'] = quoteId;
    rowByHeader['Updated At'] = updatedAt;
    rowByHeader['Reference'] = req.referenceNumber || '';
    rowByHeader['Email'] = req.email || '';
    rowByHeader['Lead Name'] = req.leadName || '';
    rowByHeader['Quote Id'] = req.quoteId || '';
    rowByHeader['Status'] = req.status || '';
    rowByHeader['Version'] = req.version || req.quoteVersion || '';
    rowByHeader['Title'] = req.title || '';
    rowByHeader['Event Type'] = req.eventType || '';
    rowByHeader['Event Date'] = req.eventDate || '';
    rowByHeader['Guests'] = firstDefined_(req.guestCount, req.guests, '');
    rowByHeader['Guests High'] = req.guestCountHigh || '';
    rowByHeader['Repeat Client'] = yesNo_(req.repeatClient);
    rowByHeader['Agent Referral'] = yesNo_(req.agentReferral);
    rowByHeader['Key Items'] = req.keyItems || '';
    rowByHeader['Weekly Period'] = req.weeklyPeriod || '';
    rowByHeader['Day Period'] = req.dayPeriod || '';
    rowByHeader['Group Bracket'] = req.groupBracket || '';
    rowByHeader['No Of Tables'] = req.noOfTables || '';
    rowByHeader['Selected Upgrades'] = upgrades;
    rowByHeader['Selected Cost Lines'] = lineLabels;
    rowByHeader['Template Id'] = req.templateId || req.template_id || '';
    rowByHeader['Selected Inserts'] = inserts;
    rowByHeader['Staff Contact'] = req.staffContact || '';
    rowByHeader['Subtotal Pre Contingency'] = firstDefined_(req.subtotalBeforeContingency, '');
    rowByHeader['Base Cost'] = firstDefined_(req.baseCost, '');
    rowByHeader['Contingency'] = firstDefined_(req.contingency, '');
    rowByHeader['Margin'] = firstDefined_(req.margin, '');
    rowByHeader['Margin Amount'] = firstDefined_(req.marginAmount, '');
    rowByHeader['Discount %'] = firstDefined_(req.discountPercent, '');
    rowByHeader['Discount Amount'] = firstDefined_(req.discountAmount, '');
    rowByHeader['Commission %'] = firstDefined_(req.commissionPercent, '');
    rowByHeader['Commission Amount'] = firstDefined_(req.commissionAmount, '');
    rowByHeader['Updated Profit'] = firstDefined_(req.updatedProfit, '');
    rowByHeader['Cost Per Guest Exc'] = firstDefined_(req.costPerGuestExc, '');
    rowByHeader['Cost Per Guest Inc'] = firstDefined_(req.costPerGuestInc, '');
    rowByHeader['Cost To Client'] = firstDefined_(req.costToClient, req.packageCost, '');
    rowByHeader['Package Cost'] = firstDefined_(req.packageCost, req.costToClient, '');
    rowByHeader['VAT'] = firstDefined_(req.vat, '');
    rowByHeader['Upgrade Total'] = firstDefined_(req.upgradeTotal, '');
    rowByHeader['Grand Total'] = firstDefined_(req.grandTotal, '');
    rowByHeader['Section Totals'] = sectionTotals || '';

    appendMappedRow_(sheet, rowByHeader);
    SpreadsheetApp.flush();
    return { ok: true, quote: quoteFromRow_(rowByHeader) };
  } finally {
    lock.releaseLock();
  }
}

function handleQuotesFetch_(req) {
  var ss = openWorkbook_();
  var sheet = ss.getSheetByName(QUOTES_TAB);
  if (!sheet) return { ok: true, count: 0, quotes: [] };
  var want = norm_(req.referenceNumber || req.reference || '');
  var quotes = readMappedRows_(sheet).map(quoteFromRow_).filter(function (q) {
    if (!q.id && !q.status) return false;
    if (!want) return true;
    return norm_(q.referenceNumber) === want;
  });
  return { ok: true, count: quotes.length, quotes: quotes };
}

function readMappedRows_(sheet) {
  var values = sheet.getDisplayValues();
  if (!values || values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var r = values.length - 1; r >= 1; r--) {
    var obj = {};
    var any = false;
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c] || '').trim();
      if (!h) continue;
      var v = values[r][c];
      obj[h] = v;
      if (v !== undefined && v !== null && String(v).trim() !== '') any = true;
    }
    if (any) rows.push(obj);
  }
  return rows;
}

function noteFromRow_(row) {
  return {
    id: String(row.Id || row.id || ''),
    createdAt: String(row['Created At'] || row.createdAt || ''),
    referenceNumber: String(row.Reference || row.referenceNumber || ''),
    email: String(row.Email || row.email || ''),
    leadName: String(row['Lead Name'] || row.leadName || ''),
    tag: String(row.Tag || row.tag || ''),
    note: String(row.Note || row.note || ''),
  };
}

function quoteFromRow_(row) {
  return {
    id: String(row.Id || row.id || ''),
    updatedAt: String(row['Updated At'] || row.updatedAt || ''),
    referenceNumber: String(row.Reference || row.referenceNumber || ''),
    email: String(row.Email || row.email || ''),
    leadName: String(row['Lead Name'] || row.leadName || ''),
    quoteId: String(row['Quote Id'] || row.quoteId || ''),
    status: String(row.Status || row.status || ''),
    version: String(row.Version || row.version || ''),
    title: String(row.Title || row.title || ''),
    eventType: String(row['Event Type'] || row.eventType || ''),
    eventDate: String(row['Event Date'] || row.eventDate || ''),
    guestCount: row.Guests != null ? row.Guests : (row.guestCount || ''),
    guestCountHigh: row['Guests High'] != null ? row['Guests High'] : (row.guestCountHigh || ''),
    grandTotal: row['Grand Total'] != null ? row['Grand Total'] : (row.grandTotal || ''),
    costToClient: row['Cost To Client'] != null ? row['Cost To Client'] : (row.costToClient || ''),
    vat: row.VAT != null ? row.VAT : (row.vat || ''),
    templateId: String(row['Template Id'] || row.templateId || ''),
  };
}

function appendMappedRow_(sheet, rowByHeader) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    row.push(h && rowByHeader[h] !== undefined ? rowByHeader[h] : '');
  }
  sheet.appendRow(row);
}

function firstDefined_() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
  }
  return '';
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (lastRow === 0 || lastCol === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  var existing = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var missing = [];
  for (var i = 0; i < headers.length; i++) {
    var found = false;
    for (var j = 0; j < existing.length; j++) {
      if (String(existing[j] || '').trim() === headers[i]) {
        found = true;
        break;
      }
    }
    if (!found) missing.push(headers[i]);
  }
  if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}
