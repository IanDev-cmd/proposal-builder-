/**
 * WEOTT Nexus Catalog — extras (3rd script)
 * ------------------------------------------
 * Paste as a NEW file next to Code.gs and Sentry.gs.
 * Suggested name in the Apps Script editor: Extras.gs
 *
 * Complements:
 *   Code.gs    = NexusCatalog.gs (Cost Mother + enquiry refs)
 *   Sentry.gs  = NexusCatalogTaxonomy.gs (alias table — no Run functions)
 *
 * Copies these tabs into _Nexus Catalog as extra kind rows:
 *   margin          ← Minimum target margin (per event type)
 *   cutlery_ratio   ← Cutlery Ratios
 *   staff_ratio     ← WEOTT Event Catering Staff Ratios
 *
 * Does NOT read Menu Cheat Sheet, diaries, or phone price guides.
 *
 * Setup:
 * 1. Paste this file. Save.
 * 2. In the toolbar, open Code.gs and run buildNexusCatalog
 *    (do not Run while Sentry.gs is focused — it has no functions).
 * 3. Optional: run previewCatalogExtras here to log extra-row counts.
 */

var SKIP_SHEET_RE = /menu\s*cheat|cheat\s*sheet|\bdiar(y|ies)\b|phone\s*(price\s*)?guide|phone\s*prices?/i;
var MARGIN_SHEET_RE = /minimum\s*target\s*margin/i;
var CUTLERY_SHEET_RE = /cutlery\s*ratios?/i;
var STAFF_SHEET_RE = /staff\s*ratios?|catering\s*staff\s*ratio/i;

/** True when an edit on this tab should rebuild the catalog extras. */
function isCatalogExtrasSheet_(name) {
  if (!name || SKIP_SHEET_RE.test(name)) return false;
  return MARGIN_SHEET_RE.test(name) || CUTLERY_SHEET_RE.test(name) || STAFF_SHEET_RE.test(name);
}

/**
 * Parse extra tabs. Called by buildNexusCatalog in Code.gs.
 * Returns rows: [kind, label, section, multiplier, rateKey, rate]
 */
function collectCatalogExtras_(ss) {
  var out = [];
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var name = sh.getName();
    if (shouldSkipSheet_(name)) continue;
    if (MARGIN_SHEET_RE.test(name)) {
      out = out.concat(parseMarginSheet_(sh));
    } else if (CUTLERY_SHEET_RE.test(name)) {
      out = out.concat(parseRatioSheet_(sh, 'cutlery_ratio'));
    } else if (STAFF_SHEET_RE.test(name)) {
      out = out.concat(parseRatioSheet_(sh, 'staff_ratio'));
    }
  }
  return out;
}

/** Runnable from Extras.gs — logs counts without rewriting the catalog. */
function previewCatalogExtras() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var extras = collectCatalogExtras_(ss);
  var counts = { margin: 0, cutlery_ratio: 0, staff_ratio: 0 };
  var skipped = [];
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (SKIP_SHEET_RE.test(n)) skipped.push(n);
  });
  extras.forEach(function (row) {
    var k = row[0];
    if (counts[k] == null) counts[k] = 0;
    counts[k]++;
  });
  Logger.log(
    'Catalog extras: ' + extras.length + ' rows ' + JSON.stringify(counts) +
    (skipped.length ? ' | skipped: ' + skipped.join(', ') : ' | no cheat/diary/phone tabs skipped'),
  );
  return extras.length;
}

function shouldSkipSheet_(name) {
  if (!name) return true;
  var catalogTab = typeof CATALOG_TAB !== 'undefined' ? CATALOG_TAB : '_Nexus Catalog';
  if (name === catalogTab || name.charAt(0) === '_') return true;
  return SKIP_SHEET_RE.test(name);
}

function extrasToNumber_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v).replace(/[£$,\s]/g, '').replace(/%$/, '');
  if (!s || s === '-' || s === '—') return null;
  var ratio = s.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    var den = Number(ratio[2]);
    return den ? Number(ratio[1]) / den : null;
  }
  var per = s.match(/^1\s*(?:per|:)\s*(\d+(?:\.\d+)?)$/i);
  if (per) return Number(per[1]);
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function extrasCell_(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

function monthKey_(s) {
  var t = extrasCell_(s).toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return '';
  var three = t.slice(0, 3);
  var map = {
    jan: 'JAN', feb: 'FEB', mar: 'MAR', apr: 'APR', may: 'MAY', jun: 'JUN',
    jul: 'JUL', aug: 'AUG', sep: 'SEP', oct: 'OCT', nov: 'NOV', dec: 'DEC',
  };
  return map[three] || '';
}

function isTitleRow_(row) {
  var n = 0;
  for (var i = 0; i < row.length; i++) {
    if (extrasCell_(row[i])) n++;
  }
  return n <= 1;
}

function findMonthHeader_(values) {
  var scan = Math.min(20, values.length);
  var best = { idx: -1, score: 0 };
  for (var r = 0; r < scan; r++) {
    if (isTitleRow_(values[r])) continue;
    var score = 0;
    for (var c = 0; c < values[r].length; c++) {
      if (monthKey_(values[r][c])) score++;
    }
    if (score > best.score) best = { idx: r, score: score };
  }
  return best.score >= 3 ? best.idx : -1;
}

function findMatrixHeader_(values) {
  var scan = Math.min(20, values.length);
  for (var r = 0; r < scan; r++) {
    if (isTitleRow_(values[r])) continue;
    var n = 0;
    for (var c = 0; c < values[r].length; c++) {
      if (extrasCell_(values[r][c])) n++;
    }
    if (n >= 2) return r;
  }
  return values.length ? 0 : -1;
}

function headerRole_(cell, col, monthCols) {
  if (monthCols[col]) return 'month';
  var s = extrasCell_(cell).toLowerCase();
  if (/market|sector|channel/.test(s)) return 'market';
  if (/event|service|product|type/.test(s)) return 'event';
  return '';
}

function normalizeMargin_(n) {
  if (n == null || !isFinite(n) || n < 0) return null;
  if (n > 1 && n <= 100) return n / 100;
  if (n > 1) return null;
  return n;
}

function parseMarginSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headerIdx = findMonthHeader_(values);
  if (headerIdx < 0) return [];

  var header = values[headerIdx];
  var monthCols = {};
  var eventCol = -1;
  var marketCol = -1;
  for (var c = 0; c < header.length; c++) {
    var mk = monthKey_(header[c]);
    if (mk) {
      monthCols[c] = mk;
      continue;
    }
    var role = headerRole_(header[c], c, monthCols);
    if (role === 'event' && eventCol < 0) eventCol = c;
    if (role === 'market' && marketCol < 0) marketCol = c;
  }
  for (var c2 = 0; c2 < header.length; c2++) {
    if (monthCols[c2] != null) continue;
    if (eventCol < 0) eventCol = c2;
    else if (marketCol < 0 && extrasCell_(header[c2])) marketCol = c2;
  }
  if (eventCol < 0) eventCol = 0;

  var rows = [];
  var lastEvent = '';
  var lastMarket = '';
  for (var r = headerIdx + 1; r < values.length; r++) {
    var row = values[r];
    var event = extrasCell_(row[eventCol]);
    var market = marketCol >= 0 ? extrasCell_(row[marketCol]) : '';
    if (event) lastEvent = event;
    if (market) lastMarket = market;
    if (!lastEvent) continue;
    if (/^total\b/i.test(lastEvent)) continue;

    for (var c = 0; c < row.length; c++) {
      var month = monthCols[c];
      if (!month) continue;
      var n = normalizeMargin_(extrasToNumber_(row[c]));
      if (n == null) continue;
      rows.push(['margin', lastEvent, lastMarket, '', month, n]);
    }
  }
  return rows;
}

function parseRatioSheet_(sheet, kind) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headerIdx = findMatrixHeader_(values);
  if (headerIdx < 0) return [];

  var header = values[headerIdx];
  var keyCols = [];
  for (var c = 1; c < header.length; c++) {
    var h = extrasCell_(header[c]);
    if (h) keyCols.push({ c: c, key: h });
  }
  if (!keyCols.length) return [];

  var rows = [];
  var lastLabel = '';
  var lastGroup = '';
  for (var r = headerIdx + 1; r < values.length; r++) {
    var row = values[r];
    var label = extrasCell_(row[0]);
    if (label) lastLabel = label;
    if (!lastLabel) continue;
    if (/^total\b/i.test(lastLabel)) continue;

    var groupCell = extrasCell_(row[1]);
    if (groupCell && extrasToNumber_(row[1]) == null) lastGroup = groupCell;

    for (var i = 0; i < keyCols.length; i++) {
      var col = keyCols[i];
      var n = extrasToNumber_(row[col.c]);
      if (n == null) continue;
      rows.push([kind, lastLabel, lastGroup, '', col.key, n]);
    }
  }
  return rows;
}
