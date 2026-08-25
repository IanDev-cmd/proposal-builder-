/**
 * Downloadable quote cost sheet (CSV) for Cost Check and Saved Quotes.
 */
import { SECTION_META } from '@/lib/quoteBuilderCatalog';
import { calcFinancials, type QuoteFormInput } from '@/lib/quoteFinance';
import type { SavedQuote } from '@/lib/savedQuotesStore';

function csvCell(value: string | number): string {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function quoteFormFromSaved(data: Record<string, unknown> | undefined): QuoteFormInput | null {
  if (!data || typeof data !== 'object') return null;
  const vessel = data.vesselType;
  return {
    ...(data as unknown as QuoteFormInput),
    vesselType: Array.isArray(vessel) ? (vessel as string[]) : vessel ? [String(vessel)] : [],
    menuType: Array.isArray(data.menuType) ? (data.menuType as string[]) : [],
    selectedUpgrades: Array.isArray(data.selectedUpgrades) ? (data.selectedUpgrades as string[]) : [],
    selectedLineIds: Array.isArray(data.selectedLineIds) ? (data.selectedLineIds as string[]) : [],
  };
}

export function costSheetCsv(form: QuoteFormInput, title = 'Quote'): string {
  const fin = calcFinancials(form);
  const rows: (string | number)[][] = [
    ['Quote', title],
    ['Version', form.quoteVersion || 'V1'],
    ['Vessel', (form.vesselType || []).join(', ')],
    ['Event', form.eventType || ''],
    ['Guests', form.guestCount || ''],
    ['Key items', form.keyItems || ''],
    [],
    ['Section', 'Line', 'Amount'],
  ];
  for (const line of fin.lines || []) {
    if (!line.amount) continue;
    const sec = SECTION_META.find((s) => s.id === line.section);
    rows.push([sec?.title || line.section, line.label, line.amount.toFixed(2)]);
  }
  rows.push([]);
  rows.push(['Total to WEOTT', '', fin.baseCost.toFixed(2)]);
  rows.push([`Margin (${(fin.margin * 100).toFixed(1)}%)`, '', fin.marginAmount.toFixed(2)]);
  rows.push(['Cost to client (exc VAT)', '', fin.costToClient.toFixed(2)]);
  rows.push(['VAT (20%)', '', fin.vat.toFixed(2)]);
  rows.push(['Grand total', '', fin.grand.toFixed(2)]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function costSheetPlainText(form: QuoteFormInput, title = 'Quote'): string {
  const fin = calcFinancials(form);
  const lines = (fin.lines || [])
    .filter((l) => l.amount > 0)
    .map((l) => `  ${l.label}: £${l.amount.toFixed(2)}`);
  return [
    title,
    `Version ${form.quoteVersion || 'V1'} · ${(form.vesselType || []).join(', ') || 'Vessel TBC'} · ${form.guestCount || '—'} guests`,
    form.keyItems ? `Key items: ${form.keyItems}` : '',
    '',
    'Cost lines',
    ...lines,
    '',
    `Total to WEOTT: £${fin.baseCost.toFixed(2)}`,
    `Cost to client (exc VAT): £${fin.costToClient.toFixed(2)}`,
    `Grand total: £${fin.grand.toFixed(2)}`,
  ]
    .filter((s) => s !== '')
    .join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadCostSheetCsv(opts: { form: QuoteFormInput; title?: string; filename?: string }) {
  const title = opts.title || 'Quote';
  const stem = (opts.filename || title).replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
  const csv = costSheetCsv(opts.form, title);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${stem}-cost-sheet.csv`);
}

export function downloadSavedQuoteCostSheet(quote: SavedQuote) {
  const form = quoteFormFromSaved(quote.data);
  if (!form) return false;
  downloadCostSheetCsv({
    form,
    title: quote.title,
    filename: `${quote.referenceNumber || quote.leadKey}-${quote.data?.quoteVersion || 'V1'}`,
  });
  return true;
}
