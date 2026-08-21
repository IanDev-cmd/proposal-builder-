/**
 * Staff profile contacts — used when a staff insert is selected.
 * Selecting a staff insert replaces PDF page 16 and overrides default Katherine contact fields.
 * phone → template T: slot, mobile → template M: slot (payload never includes T:/M: labels).
 */

import { formatUkPhone, staffPhoneSlots } from '@/lib/phoneFormat';

export type StaffContact = {
  name: string;
  title: string;
  phone: string;
  mobile?: string;
  email: string;
};

function contact(partial: StaffContact): StaffContact {
  const slots = staffPhoneSlots(partial.phone, partial.mobile);
  return {
    ...partial,
    phone: slots.phone || formatUkPhone(partial.phone),
    mobile: slots.mobile || undefined,
  };
}

const DEFAULT_CONTACT: StaffContact = contact({
  name: 'Katherine Bulaon',
  title: 'Client Relationship Manager',
  phone: '020 8323 5827',
  email: 'sales@westendonthethames.com',
});

/** Known CRM staff from Proposal Inserts zip. */
const OFFICE_PHONE = '020 8323 5827';
const OFFICE_EMAIL = 'sales@westendonthethames.com';

export const STAFF_CONTACTS: Record<string, StaffContact> = {
  'Katherine Bulaon': contact({
    name: 'Katherine Bulaon',
    title: 'Client Relationship Manager',
    phone: OFFICE_PHONE,
    email: OFFICE_EMAIL,
  }),
  'Sapphire Adams': contact({
    name: 'Sapphire Adams',
    title: 'Client Relationship Manager',
    phone: OFFICE_PHONE,
    email: OFFICE_EMAIL,
  }),
  'Elizabeth Hillier': contact({
    name: 'Elizabeth Hillier',
    title: 'Client Relationship Manager',
    phone: OFFICE_PHONE,
    email: OFFICE_EMAIL,
  }),
  'Ellie Kirotar': contact({
    name: 'Ellie Kirotar',
    title: 'Client Relationship Manager',
    phone: OFFICE_PHONE,
    email: OFFICE_EMAIL,
  }),
  'Lily-May Cameron': contact({
    name: 'Lily-May Cameron',
    title: 'Client Relationship Manager',
    phone: OFFICE_PHONE,
    email: OFFICE_EMAIL,
  }),
  'Natasha Minter': contact({
    name: 'Natasha Minter',
    title: 'Client Relationship Manager',
    phone: OFFICE_PHONE,
    email: OFFICE_EMAIL,
  }),
};

export function contactFromStaffName(staff?: string | null): StaffContact {
  if (!staff) return DEFAULT_CONTACT;
  if (STAFF_CONTACTS[staff]) return STAFF_CONTACTS[staff];
  const lower = staff.trim().toLowerCase();
  for (const contact of Object.values(STAFF_CONTACTS)) {
    if (contact.name.toLowerCase() === lower) return contact;
    if (contact.name.split(/\s+/)[0].toLowerCase() === lower) return contact;
  }
  return contact({
    name: staff,
    title: 'Client Relationship Manager',
    phone: DEFAULT_CONTACT.phone,
    mobile: DEFAULT_CONTACT.mobile,
    email: DEFAULT_CONTACT.email,
  });
}

/** Map Lead Sheet first names (Natasha, Katherine, …) to cover surnames. */
export function fullStaffName(raw?: string | null): string {
  const s = String(raw || '').trim();
  if (!s) return DEFAULT_CONTACT.name;
  return contactFromStaffName(s).name;
}

export function resolveStaffContactFromInsertIds(
  selectedInsertIds: string[],
  inserts: { id: string; kind?: string; staff?: string }[],
): StaffContact {
  const staffInserts = selectedInsertIds
    .map((id) => inserts.find((i) => i.id === id && i.kind === 'staff'))
    .filter(Boolean) as { id: string; staff?: string }[];
  if (!staffInserts.length) return DEFAULT_CONTACT;
  const last = staffInserts[staffInserts.length - 1];
  return contactFromStaffName(last.staff);
}

export { DEFAULT_CONTACT };
