/**
 * Turn engine cover/contact fit warnings into a specific sentence
 * (e.g. "The telephone number is too long for the cover field.").
 */
const FIELD_LABELS: Record<string, string> = {
  proposal_ref: 'proposal reference',
  prepared_by: 'prepared-by name',
  quote_date: 'quote date',
  client_name: 'client name',
  organisation: 'organisation name',
  telephone: 'telephone number',
  email: 'email address',
  event_type: 'event type',
  event_date: 'event date',
  event_timings: 'event timings',
  guest_range: 'guest range',
  guest_quote_n: 'guest quote number',
  contact_phone: 'telephone number',
  contact_mobile: 'mobile number',
  contact_email: 'email address',
  contact_name: 'contact name',
};

function fieldFromWarning(raw: string): string {
  const tagged = /^\[([^\]]+)\]\s*/.exec(raw);
  if (tagged) return tagged[1].replace(/^cover\./, '');
  const cover = /cover\.([a-z_]+)/i.exec(raw);
  if (cover) return cover[1];
  for (const key of Object.keys(FIELD_LABELS)) {
    if (raw.toLowerCase().includes(key.replace('_', ' ')) || raw.toLowerCase().includes(key)) {
      return key;
    }
  }
  return '';
}

export function isLayoutOverflowWarning(raw: string): boolean {
  const msg = String(raw || '').toLowerCase();
  return /shrink|too long|will not fit|does not fit/.test(msg);
}

export function humanizeEngineWarning(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^the .+ is too long for the cover field\.?$/i.test(text)) {
    return text.endsWith('.') ? text : `${text}.`;
  }
  const field = fieldFromWarning(text);
  if (field && isLayoutOverflowWarning(text)) {
    const label = FIELD_LABELS[field] || field.replace(/_/g, ' ');
    return `The ${label} is too long for the cover field.`;
  }
  return text.replace(/^\[[^\]]+\]\s*/, '');
}

export function layoutOverflowMessages(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw.map((item) => String(item ?? '')) : [];
  const out: string[] = [];
  for (const item of items) {
    if (!isLayoutOverflowWarning(item) && !/too long for the cover field/i.test(item)) continue;
    const human = humanizeEngineWarning(item);
    if (human && !out.includes(human)) out.push(human);
  }
  return out;
}

export function parseEngineWarningHeader(header: string | null): string[] {
  if (!header?.trim()) return [];
  try {
    const parsed = JSON.parse(header) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item ?? '')) : [header];
  } catch {
    return [header];
  }
}

export function isLayoutOverflowOnly(errors: unknown): boolean {
  const list = Array.isArray(errors) ? errors.map((item) => String(item ?? '')).filter(Boolean) : [];
  return list.length > 0 && list.every((item) => isLayoutOverflowWarning(item) || /too long for the cover field/i.test(item));
}
