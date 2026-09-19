/**
 * WEOTT lead references — WE.N on Enquiry - Lead Data (2026)
 * ----------------------------------------------------------
 * Paste as a NEW file next to Code.gs. Suggested name: References.gs
 *
 * Owns assignReferencesTimed and handleLeadAgentReference so Code.gs
 * (catalog) and this file cannot overwrite each other.
 *
 * Code.gs keeps calling these by name:
 *   - 1-minute trigger → assignReferencesTimed
 *   - onInstallableEdit / pushWorkbookToNexus_ → assignReferencesTimed
 *   - onInstallableEdit on an Enquiry tab → handleLeadAgentReference
 *
 * Do not also define those two functions in Code.gs — duplicate names
 * fail the Apps Script project.
 *
 * Rules:
 *   - 2026 enquiry tab only; 2022–2025 are never touched
 *   - A row is a lead if column A (status) OR column C (name) is filled
 *   - Writes only the column-J cells that change
 */

var LEAD_TAB_2026 = 'Enquiry - Lead Data (2026)';

/** Assign WE.N references on the 2026 enquiry tab only. */
function assignReferencesTimed() {
  var ss = nexusWorkbook_();
  var sheet = ss.getSheetByName(LEAD_TAB_2026);
  if (!sheet) return;
  handleLeadAgentReference(sheet);
}

/**
 * Column J (10) — assign WE.N when an enquiry row has data but no ref.
 * 2026 tab only: historical year tabs are never touched.
 * A row is a lead if column A (status) OR column C (name) is filled,
 * so a blank status can no longer block a reference.
 * Writes only the cells that change, never the whole column.
 */
function handleLeadAgentReference(sheet) {
  if (!sheet || sheet.getName() !== LEAD_TAB_2026) return;

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return;
  }
  try {
    var refCol = 10;
    var prefix = 'WE.';
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    // Only scan recent rows; older rows already have references.
    var WINDOW = 300;
    var startRow = Math.max(2, lastRow - WINDOW + 1);
    var numRows = lastRow - startRow + 1;
    var values = sheet.getRange(startRow, 1, numRows, refCol).getValues();

    var maxRef = 0;
    var i;
    for (i = 0; i < numRows; i++) {
      var v = String(values[i][refCol - 1]).trim();
      if (v.indexOf(prefix) === 0) {
        var n = parseInt(v.replace(prefix, ''), 10);
        if (!isNaN(n) && n > maxRef) maxRef = n;
      }
    }

    // If the window held no references, search the whole column
    // so numbering never restarts at WE.1.
    if (maxRef === 0 && startRow > 2) {
      var allRefs = sheet.getRange(2, refCol, lastRow - 1, 1).getValues();
      for (i = 0; i < allRefs.length; i++) {
        var av = String(allRefs[i][0]).trim();
        if (av.indexOf(prefix) === 0) {
          var an = parseInt(av.replace(prefix, ''), 10);
          if (!isNaN(an) && an > maxRef) maxRef = an;
        }
      }
    }
    if (maxRef === 0) return;

    var wrote = false;
    for (var j = 0; j < numRows; j++) {
      var existing = String(values[j][refCol - 1]).trim();
      if (existing.indexOf(prefix) === 0) continue;

      var hasData =
        String(values[j][0]).trim() !== '' ||
        String(values[j][2]).trim() !== '';
      if (!hasData) continue;

      maxRef++;
      sheet.getRange(startRow + j, refCol).setValue(prefix + maxRef);
      wrote = true;
    }
    if (wrote) SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}
