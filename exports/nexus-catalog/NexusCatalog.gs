/**
 * WEOTT Nexus Catalog — sheet brain
 * ---------------------------------
 * Paste into Extensions → Apps Script on the LIVE workbook.
 *
 * Setup:
 * 1. Paste files: Code.gs (this), References.gs, Sentry.gs, Extras.gs, NexusApi.gs.
 * 2. Run installNexusTriggers once (or open the workbook — onOpen installs missing ones).
 * 3. Authorize SpreadsheetApp + ScriptApp.
 *
 * Triggers installed by installNexusTriggers / onOpen:
 *   - onInstallableEdit  (any cell edit, any tab)
 *   - onSpreadsheetChange (row/column/tab/sheet insert, delete, rename, grid)
 *   - buildNexusCatalog   every 1 minute (safety net)
 *   - assignReferencesTimed every 1 minute (implemented in References.gs)
 *
 * Any workbook change rebuilds "_Nexus Catalog" so CostRatesFetch / LeadDataFetch
 * return current Cost Mother labels, rates, and enquiry rows. Nexus polls that
 * catalog every 30s and stores the last-good copy as the UX fallback.
 *
 * Writes tab "_Nexus Catalog". NexusApi.gs CostRatesFetch reads that tab, and
 * rebuilds it first when the catalog is missing or stale.
 * Extras.gs appends margin / cutlery_ratio / staff_ratio rows.
 *
 * WE.N references live in References.gs. Do not define assignReferencesTimed
 * or handleLeadAgentReference here — duplicate names fail the project.
 * Triggers and pushWorkbookToNexus_ keep calling them by name.
 */

var CATALOG_TAB = '_Nexus Catalog';
var COST_MOTHER_RE = /cost mother/i;
var ENQUIRY_RE = /enquiry.*lead/i;
var NEXUS_WB_ID = '1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o';
var CATALOG_BUILD_LOCK_KEY = 'nexus_building_catalog';
var CATALOG_STALE_MS = 90 * 1000;

function nexusWorkbook_() {
  var id = (typeof NEXUS_WORKBOOK_ID !== 'undefined' && NEXUS_WORKBOOK_ID)
    ? NEXUS_WORKBOOK_ID
    : NEXUS_WB_ID;
  try {
    return SpreadsheetApp.openById(id);
  } catch (err) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function catalogBuildCache_() {
  return CacheService.getScriptCache();
}

function markCatalogBuilding_(on) {
  var cache = catalogBuildCache_();
  if (on) cache.put(CATALOG_BUILD_LOCK_KEY, '1', 45);
  else cache.remove(CATALOG_BUILD_LOCK_KEY);
}

function isCatalogBuilding_() {
  return Boolean(catalogBuildCache_().get(CATALOG_BUILD_LOCK_KEY));
}

/** Bound-script menu + idempotent trigger install when the workbook is opened. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Nexus')
      .addItem('Install workbook sync triggers', 'installNexusTriggers')
      .addItem('Rebuild catalog now', 'buildNexusCatalog')
      .addToUi();
  } catch (err) {
    /* web app / installable context has no UI */
  }
  ensureNexusTriggers_();
}

/**
 * Create (or repair) installable triggers for the whole workbook.
 * Run once after pasting this file. onOpen also calls ensureNexusTriggers_.
 */
function installNexusTriggers() {
  ensureNexusTriggers_(true);
}

function ensureNexusTriggers_(forceRecreate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || nexusWorkbook_();
  var want = {
    onInstallableEdit: ScriptApp.EventType.ON_EDIT,
    onSpreadsheetChange: ScriptApp.EventType.ON_CHANGE,
    buildNexusCatalog: ScriptApp.EventType.CLOCK,
    assignReferencesTimed: ScriptApp.EventType.CLOCK,
  };
  var have = {};
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    var h = t.getHandlerFunction();
    if (!want[h]) continue;
    if (forceRecreate) {
      ScriptApp.deleteTrigger(t);
      continue;
    }
    if (have[h]) {
      ScriptApp.deleteTrigger(t);
      continue;
    }
    have[h] = true;
  }
  if (!have.onInstallableEdit) {
    ScriptApp.newTrigger('onInstallableEdit').forSpreadsheet(ss).onEdit().create();
  }
  if (!have.onSpreadsheetChange) {
    ScriptApp.newTrigger('onSpreadsheetChange').forSpreadsheet(ss).onChange().create();
  }
  if (!have.buildNexusCatalog) {
    ScriptApp.newTrigger('buildNexusCatalog').timeBased().everyMinutes(1).create();
  }
  if (!have.assignReferencesTimed) {
    ScriptApp.newTrigger('assignReferencesTimed').timeBased().everyMinutes(1).create();
  }
}

function buildNexusCatalog() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  markCatalogBuilding_(true);
  try {
    var ss = nexusWorkbook_();
    var mother = findSheet_(ss, COST_MOTHER_RE);
    if (!mother) throw new Error('No Cost Mother tab found');

    var parsed = parseCostMother_(mother);
    var extras = typeof collectCatalogExtras_ === 'function' ? collectCatalogExtras_(ss) : [];
    writeCatalog_(ss, parsed, extras);
    deleteUnusedOpsTabs_(ss);
    Logger.log(
      'Catalog: ' + parsed.lines.length + ' lines, ' + parsed.rates.length + ' rates, ' +
      parsed.vessels.length + ' vessels, ' + extras.length + ' extras',
    );
  } finally {
    markCatalogBuilding_(false);
    lock.releaseLock();
  }
}

/** Rebuild if the catalog tab is missing, empty, or older than CATALOG_STALE_MS. */
function ensureNexusCatalogFresh_() {
  if (isCatalogBuilding_()) return;
  var ss = nexusWorkbook_();
  var tab = ss.getSheetByName(CATALOG_TAB);
  if (!tab || tab.getLastRow() < 2) {
    buildNexusCatalog();
    return;
  }
  var builtAt = '';
  try {
    var values = tab.getRange(1, 1, Math.min(8, tab.getLastRow()), 6).getValues();
    for (var r = 0; r < values.length; r++) {
      if (String(values[r][0] || '').toLowerCase() === 'meta' &&
          /catalog_built_at/i.test(String(values[r][1] || ''))) {
        builtAt = String(values[r][5] || values[r][4] || '').trim();
        break;
      }
    }
  } catch (err) {
    builtAt = '';
  }
  var ts = builtAt ? new Date(builtAt).getTime() : 0;
  if (!ts || !isFinite(ts) || (Date.now() - ts) > CATALOG_STALE_MS) {
    buildNexusCatalog();
  }
}

function onInstallableEdit(e) {
  ensureNexusTriggers_();
  if (isCatalogBuilding_()) return;
  if (!e || !e.range) {
    pushWorkbookToNexus_();
    return;
  }
  var sheet = e.range.getSheet();
  var name = sheet.getName();
  if (name === CATALOG_TAB) return;
  if (ENQUIRY_RE.test(name)) {
    handleLeadAgentReference(sheet);
  }
  pushWorkbookToNexus_();
}

/**
 * Rows, columns, tabs, sheets, grids — anything structural in the workbook.
 * FORMAT-only changes are skipped so catalog writes do not loop.
 */
function onSpreadsheetChange(e) {
  ensureNexusTriggers_();
  if (isCatalogBuilding_()) return;
  var changeType = String((e && e.changeType) || '').toUpperCase();
  if (changeType === 'FORMAT') return;
  pushWorkbookToNexus_();
}

function pushWorkbookToNexus_() {
  assignReferencesTimed();
  buildNexusCatalog();
}

function findSheet_(ss, re) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (re.test(sheets[i].getName())) return sheets[i];
  }
  return null;
}

function fillForward_(row) {
  var last = '';
  var out = [];
  for (var i = 0; i < row.length; i++) {
    var s = String(row[i] == null ? '' : row[i]).trim();
    if (s) last = s;
    out.push(last);
  }
  return out;
}

function scoreRow_(row, needles) {
  var n = 0;
  for (var i = 0; i < row.length; i++) {
    var s = String(row[i] || '').toLowerCase();
    if (!s) continue;
    for (var j = 0; j < needles.length; j++) {
      if (s.indexOf(needles[j]) >= 0) {
        n++;
        break;
      }
    }
  }
  return n;
}

function parseCostMother_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { lines: [], rates: [], vessels: [] };

  var scan = Math.min(12, values.length);
  var vesselNeedles = ['rose', 'avontuur', 'salamander', 'erasmus', 'dixie', 'elizabeth', 'edward', 'limo', 'alternative vessel', 'london'];
  var weeklyNeedles = ['mon to', 'fri to', 'thur to', 'thu to'];
  var dayNeedles = ['daytime', 'evening'];
  var groupNeedles = ['standard', 'guest'];

  var best = { vessel: [-1, 0], weekly: [-1, 0], day: [-1, 0], group: [-1, 0] };
  for (var r = 0; r < scan; r++) {
    var row = values[r];
    var sv = scoreRow_(row, vesselNeedles);
    var sw = scoreRow_(row, weeklyNeedles);
    var sd = scoreRow_(row, dayNeedles);
    var sg = scoreRow_(row, groupNeedles);
    if (sv > best.vessel[1]) best.vessel = [r, sv];
    if (sw > best.weekly[1]) best.weekly = [r, sw];
    if (sd > best.day[1]) best.day = [r, sd];
    if (sg > best.group[1]) best.group = [r, sg];
  }

  var vesselRow = best.vessel[1] >= 2 ? fillForward_(values[best.vessel[0]]) : null;
  var weeklyRow = best.weekly[1] >= 2 ? fillForward_(values[best.weekly[0]]) : null;
  var dayRow = best.day[1] >= 2 ? fillForward_(values[best.day[0]]) : null;
  var groupRow = best.group[1] >= 2 ? fillForward_(values[best.group[0]]) : null;

  var headerMax = 0;
  [best.vessel[0], best.weekly[0], best.day[0], best.group[0]].forEach(function (idx) {
    if (idx > headerMax) headerMax = idx;
  });
  var dataStart = headerMax + 1;

  var colCount = values[0].length;
  var colKeys = [];
  var vessels = {};
  for (var c = 1; c < colCount; c++) {
    var vessel = vesselRow ? String(vesselRow[c] || '').trim() : '';
    var weekly = weeklyRow ? String(weeklyRow[c] || '').trim() : 'Mon to Thur';
    var day = dayRow ? String(dayRow[c] || '').trim() : 'Daytime';
    var group = groupRow ? String(groupRow[c] || '').trim() : 'Standard';
    if (!vessel) {
      colKeys[c] = '';
      continue;
    }
    vessels[vessel] = true;
    colKeys[c] = vessel + '|' + weekly + '|' + day + '|' + group;
  }

  var lines = [];
  var rates = [];
  var seenLabel = {};
  var section = 'other';

  for (var i = dataStart; i < values.length; i++) {
    var row = values[i];
    var label = String(row[0] == null ? '' : row[0]).trim();
    if (!label) continue;
    if (/^total\b/i.test(label)) continue;
    if (/^no\.?\s*of\s*tables$/i.test(label) || /^no_of_tables$/i.test(label)) continue;

    var numericCount = 0;
    var rowRates = [];
    for (var c = 1; c < colCount; c++) {
      if (!colKeys[c]) continue;
      var n = toNumber_(row[c]);
      // 0 is the blank twin of a merged header, not a second price.
      if (n == null || n === 0) continue;
      numericCount++;
      rowRates.push({ key: colKeys[c], rate: n });
    }

    if (numericCount === 0) {
      var mapped = mapSection_(label);
      if (mapped) section = mapped;
      continue;
    }

    if (!seenLabel[label]) {
      seenLabel[label] = true;
      var inferred = inferLine_(label, section);
      lines.push({
        label: label,
        section: inferred.section,
        multiplier: inferred.multiplier,
      });
    }
    for (var k = 0; k < rowRates.length; k++) {
      rates.push({ label: label, rateKey: rowRates[k].key, rate: rowRates[k].rate });
    }
  }

  return { lines: lines, rates: rates, vessels: Object.keys(vessels) };
}

function toNumber_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number' && isFinite(v)) return v;
  var s = String(v).replace(/[£$,\s]/g, '');
  if (!s || s === '-' || s === '—') return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function mapSection_(label) {
  var s = label.toLowerCase();
  if (/section\s*1|vessel cost|vessel\/venue/i.test(s) && /section/.test(s)) return 'vessel';
  if (/section\s*2|catering(?!\s*surcharge|\s*equipment)/i.test(s) && /section/.test(s)) return 'catering';
  if (/surcharge/.test(s) && /section/.test(s)) return 'catering_surcharge';
  if (/equipment|cutlery/.test(s) && /section/.test(s)) return 'catering_equipment';
  if (/beverage|drink/.test(s) && /section/.test(s)) return 'beverages';
  if (/entertain|experience/.test(s) && /section/.test(s)) return 'entertainment';
  if (/bespoke/.test(s) && /section/.test(s)) return 'bespoke';
  if (/decor by the table|section\s*9/.test(s)) return 'decor_table';
  if (/decor/.test(s) && /section/.test(s)) return 'decor';
  if (/in house|project management/.test(s) && /section/.test(s)) return 'in_house';
  if (/staff/.test(s) && /section/.test(s)) return 'staff';
  if (/section\s*12|\bother\b/.test(s) && /section/.test(s)) return 'other';
  if (/financial/.test(s) && /section/.test(s)) return 'financial';
  if (/contingency/.test(s) && /section/.test(s)) return 'contingency';
  return '';
}

function catalogueLookup_(label) {
  if (typeof nexusTaxonomyLookup_ === 'function') return nexusTaxonomyLookup_(label);
  return null;
}

/** Section comes from the sheet header. Multiplier comes only from the taxonomy lookup. */
function inferLine_(label, sectionHint) {
  var fromTaxonomy = catalogueLookup_(label);
  if (fromTaxonomy) return fromTaxonomy;
  return { section: sectionHint || 'other', multiplier: '' };
}

function writeCatalog_(ss, parsed, extras) {
  var tab = ss.getSheetByName(CATALOG_TAB);
  if (!tab) tab = ss.insertSheet(CATALOG_TAB);
  tab.clearContents();
  var rows = [['kind', 'label', 'section', 'multiplier', 'rateKey', 'rate']];
  rows.push(['meta', 'catalog_built_at', '', '', '', new Date().toISOString()]);
  parsed.vessels.forEach(function (v) {
    rows.push(['vessel', v, '', '', '', '']);
  });
  parsed.lines.forEach(function (l) {
    rows.push(['line', l.label, l.section, l.multiplier, '', '']);
  });
  parsed.rates.forEach(function (r) {
    rows.push(['rate', r.label, '', '', r.rateKey, r.rate]);
  });
  (extras || []).forEach(function (row) {
    if (!row || !row.length) return;
    rows.push([row[0], row[1], row[2], row[3], row[4], row[5]]);
  });
  var chunk = 4000;
  for (var i = 0; i < rows.length; i += chunk) {
    var part = rows.slice(i, Math.min(i + chunk, rows.length));
    tab.getRange(i + 1, 1, part.length, 6).setValues(part);
  }
}

function deleteNexusOpsTabs() {
  deleteUnusedOpsTabs_(SpreadsheetApp.getActiveSpreadsheet());
}

function deleteUnusedOpsTabs_(ss) {
  var names = ['Nexus Ops Notes', 'Nexus Ops Quotes'];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) ss.deleteSheet(sh);
  }
}
