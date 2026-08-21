/**
 * House-style UK phones for UI + proposal payloads.
 * Strip T:/M:/Tel:/Mob: labels (template already has those) and group digits.
 */

export type ParsedPhones = {
  landline: string;
  mobile: string;
  /** Cover / CRM: formatted number(s), never T: or M: */
  display: string;
  /** Single cover Telephone slot — landline, else mobile */
  telephone: string;
};

const PLACEHOLDERS = new Set(['', '—', '-', '–', 'n/a', 'na', 'none', 'tbc']);

const LABEL_PREFIX_RE = /^(?:t|m|tel|mob(?:ile)?|phone)\s*[:.\-]?\s*/i;

const LABELED_CHUNK_RE =
  /(?:^|[\s,;/|])(?:(tel|t)|(mobile|mob|m))\s*[:.\-]?\s*([\d+()\s.-]{7,})/gi;

function digitsOnly(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('44') && d.length > 10) d = d.slice(2);
  if (d && !d.startsWith('0') && d.length === 10) d = `0${d}`;
  return d;
}

export function stripPhoneLabel(raw: string): string {
  return String(raw || '').replace(LABEL_PREFIX_RE, '').trim();
}

/** Format a single UK number. Returns '' for blanks; never includes T: / M:. */
export function formatUkPhone(raw?: string | null): string {
  const s = String(raw ?? '').trim();
  if (!s || PLACEHOLDERS.has(s.toLowerCase())) return s === '—' ? '—' : '';
  const stripped = stripPhoneLabel(s);
  if (PLACEHOLDERS.has(stripped.toLowerCase())) return stripped === '—' ? '—' : '';
  const d = digitsOnly(stripped);
  if (d.length !== 11) return stripped;
  if (d.startsWith('02')) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (d.startsWith('07') || d.startsWith('03')) return `${d.slice(0, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.startsWith('08')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.startsWith('01')) {
    const ns = d.slice(1, 3);
    if (['11', '21', '31', '41', '51', '61', '71', '81', '91'].includes(ns)) {
      return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    }
    return `${d.slice(0, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  return `${d.slice(0, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}

function classifyFormatted(formatted: string): 'mobile' | 'landline' | '' {
  if (!formatted || formatted === '—') return '';
  const d = digitsOnly(formatted);
  if (d.startsWith('07')) return 'mobile';
  if (d.length >= 10) return 'landline';
  return '';
}

function pushUnique(list: string[], value: string) {
  if (!value || value === '—') return;
  if (!list.includes(value)) list.push(value);
}

/** Split CRM blobs such as "T: 03309 005 500 M: 07407 780 281". */
export function parsePhoneFields(raw?: string | null): ParsedPhones {
  const text = String(raw ?? '').trim();
  if (!text) return { landline: '', mobile: '', display: '', telephone: '' };
  if (text === '—') return { landline: '', mobile: '', display: '—', telephone: '—' };

  let landline = '';
  let mobile = '';
  const extras: string[] = [];

  for (const match of text.matchAll(LABELED_CHUNK_RE)) {
    const formatted = formatUkPhone(match[3]);
    if (match[1]) landline = landline || formatted;
    else if (match[2]) mobile = mobile || formatted;
  }

  const remainder = text
    .replace(LABELED_CHUNK_RE, ' ')
    .replace(/\b(?:t|m|tel|mob(?:ile)?|phone)\s*[:.\-]?\s*/gi, ' ')
    .trim();

  for (const part of remainder.split(/\s*(?:[/|,;]|\band\b)\s*/i)) {
    if (!/\d/.test(part)) continue;
    pushUnique(extras, formatUkPhone(part));
  }

  if (!landline && !mobile && extras.length === 0) {
    const one = formatUkPhone(text);
    const kind = classifyFormatted(one);
    if (kind === 'mobile') mobile = one;
    else landline = one;
  } else {
    for (const extra of extras) {
      const kind = classifyFormatted(extra);
      if (kind === 'mobile' && !mobile) mobile = extra;
      else if (!landline) landline = extra;
      else if (!mobile) mobile = extra;
    }
  }

  const display = [landline, mobile].filter(Boolean).join(' / ');
  const telephone = landline || mobile;
  return { landline, mobile, display, telephone };
}

export function formatPhoneDisplay(raw?: string | null): string {
  const parsed = parsePhoneFields(raw);
  return parsed.display || parsed.telephone || '';
}

export function staffPhoneSlots(phone?: string | null, mobile?: string | null): {
  phone: string;
  mobile: string;
} {
  if (mobile) {
    const parsed = parsePhoneFields(`${phone || ''} M: ${mobile}`);
    return {
      phone: parsed.landline || formatUkPhone(phone),
      mobile: parsed.mobile || formatUkPhone(mobile),
    };
  }
  const parsed = parsePhoneFields(phone);
  return {
    phone: parsed.landline || parsed.telephone || formatUkPhone(phone),
    mobile: parsed.mobile,
  };
}
