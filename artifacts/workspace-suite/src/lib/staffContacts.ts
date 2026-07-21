/**
 * Staff profile contacts — used when a staff insert is selected.
 * Selecting a staff insert replaces PDF page 16 and overrides default Katherine contact fields.
 */

export type StaffContact = {
  name: string;
  title: string;
  phone: string;
  email: string;
};

const DEFAULT_CONTACT: StaffContact = {
  name: 'Katherine Bulaon',
  title: 'Client Relationship Manager',
  phone: '020 8323 5827',
  email: 'sales@westendonthethames.com',
};

/** Known CRM staff from Proposal Inserts zip. */
export const STAFF_CONTACTS: Record<string, StaffContact> = {
  'Katherine Bulaon': {
    name: 'Katherine Bulaon',
    title: 'Client Relationship Manager',
    phone: '020 8323 5827',
    email: 'sales@westendonthethames.com',
  },
  'Sapphire Adams': {
    name: 'Sapphire Adams',
    title: 'Client Relationship Manager',
    phone: '020 8323 5827',
    email: 'sales@westendonthethames.com',
  },
  'Elizabeth Hillier': {
    name: 'Elizabeth Hillier',
    title: 'Client Relationship Manager',
    phone: '020 8323 5827',
    email: 'sales@westendonthethames.com',
  },
  'Ellie Kirotar': {
    name: 'Ellie Kirotar',
    title: 'Client Relationship Manager',
    phone: '020 8323 5827',
    email: 'sales@westendonthethames.com',
  },
  'Lily-May Cameron': {
    name: 'Lily-May Cameron',
    title: 'Client Relationship Manager',
    phone: '020 8323 5827',
    email: 'sales@westendonthethames.com',
  },
  'Natasha Minter': {
    name: 'Natasha Minter',
    title: 'Client Relationship Manager',
    phone: '020 8323 5827',
    email: 'sales@westendonthethames.com',
  },
};

export function contactFromStaffName(staff?: string | null): StaffContact {
  if (!staff) return DEFAULT_CONTACT;
  if (STAFF_CONTACTS[staff]) return STAFF_CONTACTS[staff];
  return {
    name: staff,
    title: 'Client Relationship Manager',
    phone: DEFAULT_CONTACT.phone,
    email: DEFAULT_CONTACT.email,
  };
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
