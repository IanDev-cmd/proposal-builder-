/**
 * WEOTT Nexus Catalog — sheet brain
 * ---------------------------------
 * Paste into Extensions → Apps Script on the LIVE workbook.
 *
 * Setup:
 * 1. Run buildNexusCatalog once (authorize SpreadsheetApp).
 * 2. Triggers → onInstallableEdit → From spreadsheet → On edit.
 * 3. Optional: time trigger every 15 minutes on buildNexusCatalog.
 *
 * Writes tab "_Nexus Catalog". n8n CostRatesFetch reads that tab only.
 * Does not call n8n. Does not dump the whole workbook.
 */

var CATALOG_TAB = '_Nexus Catalog';
var COST_MOTHER_RE = /cost mother/i;
var ENQUIRY_RE = /enquiry.*lead/i;

function buildNexusCatalog() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var mother = findSheet_(ss, COST_MOTHER_RE);
    if (!mother) throw new Error('No Cost Mother tab found');

    var parsed = parseCostMother_(mother);
    writeCatalog_(ss, parsed);
    Logger.log(
      'Catalog: ' + parsed.lines.length + ' lines, ' + parsed.rates.length + ' rates, ' +
      parsed.vessels.length + ' vessels',
    );
  } finally {
    lock.releaseLock();
  }
}

function onInstallableEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var name = sheet.getName();
  if (name === CATALOG_TAB) return;

  if (ENQUIRY_RE.test(name)) {
    handleLeadAgentReference(sheet);
  }
  if (COST_MOTHER_RE.test(name) || /quote builder/i.test(name)) {
    buildNexusCatalog();
  }
}

/** Column J (10) — assign WE.N when a new enquiry row has data but no ref. */
function handleLeadAgentReference(sheet) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return;
  }
  try {
    var refCol = 10;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    var numRows = lastRow - 1;
    var refValues = sheet.getRange(2, refCol, numRows, 1).getValues();
    var dataColValues = sheet.getRange(2, 1, numRows, 1).getValues();
    var maxRef = 0;
    var prefix = 'WE.';
    refValues.forEach(function (r) {
      var val = String(r[0]);
      if (val.indexOf(prefix) === 0) {
        var num = parseInt(val.replace(prefix, ''), 10);
        if (!isNaN(num) && num > maxRef) maxRef = num;
      }
    });
    var updates = [];
    var hasUpdates = false;
    refValues.forEach(function (r, i) {
      var val = String(r[0]);
      var rowHasData = dataColValues[i][0] !== '';
      if (rowHasData && val.indexOf(prefix) !== 0) {
        maxRef++;
        updates.push([prefix + maxRef]);
        hasUpdates = true;
      } else {
        updates.push([r[0]]);
      }
    });
    if (hasUpdates) {
      sheet.getRange(2, refCol, numRows, 1).setValues(updates);
      SpreadsheetApp.flush();
    }
  } finally {
    lock.releaseLock();
  }
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

    var numericCount = 0;
    var rowRates = [];
    for (var c = 1; c < colCount; c++) {
      if (!colKeys[c]) continue;
      var n = toNumber_(row[c]);
      if (n == null) continue;
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

function inferLine_(label, sectionHint) {
  var s = label.toLowerCase();
  var section = sectionHint || 'other';
  var multiplier = 'set';

  if (/vessel\/venue hire|venue hire/.test(s)) {
    return { section: 'vessel', multiplier: 'vessel_hours' };
  }
  if (/own food surcharge/.test(s)) return { section: 'catering_surcharge', multiplier: 'set' };
  if (/spoon|fork|knife|plate|bowl|napkin|cutlery|linen \(or/.test(s) || /dessert\/starter|dinner plates|small plates/.test(s)) {
    return { section: 'catering_equipment', multiplier: 'guests' };
  }
  if (/reception drink|drink token|unlimited drinks|prosecco|champagne hour|tea\/coffee|cocktail|half a bottle/.test(s)) {
    return { section: 'beverages', multiplier: 'guests' };
  }
  if (/dj|live band|acoustic|steel band|jazz|piano|sax|karaoke|magician|tour guide|casino|photobooth|chocolate fountain|wine tasting|background music/.test(s)) {
    return { section: 'entertainment', multiplier: 'hours' };
  }
  if (/centrepiece|table linen|event decor|disposable tableware|flowers/.test(s)) {
    return { section: 'decor_table', multiplier: /cracker/i.test(s) ? 'guests' : 'tables' };
  }
  if (/festive cracker/.test(s)) return { section: 'decor_table', multiplier: 'guests' };
  if (/astro turf|rattan|red carpet|bean bag|banner|welcome board|tv -|projector|boat flag|bunting|flower\/plant|onboard wifi|white board|stationary \(pens/.test(s)) {
    return { section: 'decor', multiplier: 'hours' };
  }
  if (/project management|pier coordinator|unit management/.test(s)) {
    return { section: 'in_house', multiplier: 'set' };
  }
  if (/event manager|event coordinator|event assistant|wp runner|chef|catering assistant|photographer|videographer|security|contigency staff/.test(s)) {
    return { section: 'staff', multiplier: /photographer|contigency staff/i.test(s) ? 'hours' : 'staff_hours' };
  }
  if (/van courier|taxi|pier stop|embark|pack down|welcome and thank|graphic work|creative kitty|staff food/.test(s)) {
    return { section: 'other', multiplier: 'set' };
  }
  if (/financial admin/.test(s)) return { section: 'financial', multiplier: 'set' };
  if (/canape|breakfast|brunch|bowl food|street food|charcuterie|afternoon tea|pie station|hot fork|barbecue|seated dinner|burger|dessert|fruit skewer|tart|catering delivery/.test(s)) {
    return { section: 'catering', multiplier: /delivery/.test(s) ? 'set' : 'guests' };
  }

  if (section === 'vessel') multiplier = 'vessel_hours';
  else if (section === 'staff') multiplier = 'staff_hours';
  else if (section === 'entertainment' || section === 'decor') multiplier = 'hours';
  else if (section === 'decor_table') multiplier = 'tables';
  else if (section === 'catering' || section === 'catering_equipment' || section === 'beverages') multiplier = 'guests';
  else multiplier = 'set';

  return { section: section, multiplier: multiplier };
}

function writeCatalog_(ss, parsed) {
  var tab = ss.getSheetByName(CATALOG_TAB);
  if (!tab) tab = ss.insertSheet(CATALOG_TAB);
  tab.clearContents();
  var rows = [['kind', 'label', 'section', 'multiplier', 'rateKey', 'rate']];
  parsed.vessels.forEach(function (v) {
    rows.push(['vessel', v, '', '', '', '']);
  });
  parsed.lines.forEach(function (l) {
    rows.push(['line', l.label, l.section, l.multiplier, '', '']);
  });
  parsed.rates.forEach(function (r) {
    rows.push(['rate', r.label, '', '', r.rateKey, r.rate]);
  });
  var chunk = 4000;
  for (var i = 0; i < rows.length; i += chunk) {
    var part = rows.slice(i, Math.min(i + chunk, rows.length));
    tab.getRange(i + 1, 1, part.length, 6).setValues(part);
  }
}
