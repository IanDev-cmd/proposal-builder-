// ── Shared dropdown option lists ─────────────────────────────────────────────
// Used by both the Forms wizard (to render the dropdowns) and Settings (to let
// each individual option have its own uploadable preview photo).

export const VESSEL_TYPES = [
  'WEOTT I (Rose)',
  'WEOTT II (Avontuur)',
  'WEOTT III (Golden Sal)',
  'WEOTT IV (Vaulla)',
  'WEOTT V (Dixie)',
  'WEOTT VI (Elizabethan)',
  'WEOTT VII (Edwardian)',
  'WEOTT Limo III (Bourne)',
];

export const EVENT_TYPES = [
  'Summer Event',
  'Christmas Event',
  'Company Anniversary',
  'Networking Event',
  'Meeting',
  'Conference',
  'Social Gathering',
  'Team Building',
  'Corporate Other',
  'Transfer',
  'Award Ceremony',
  'Wedding Reception',
  'Wedding Anniversary',
  'Wedding Transfer',
  'Other',
  'Unknown - TBC',
  'Client Event',
  'Product Launch',
  'Pre-Wedding Celebration',
  'Client & Prospects Networking Cruise',
];

/**
 * Menu Type groups — Quote Builder 2026 + Menu Cheat Sheet.
 * Nested so the UI can show short lists per service style, with search across all.
 */
export type MenuOption = {
  label: string;
  /** Service style from Menu Cheat Sheet (shown as hint). */
  style?: string;
};

export type MenuGroup = {
  id: string;
  label: string;
  description?: string;
  options: MenuOption[];
};

export const MENU_GROUPS: MenuGroup[] = [
  {
    id: 'tray',
    label: 'Tray Service',
    description: 'Passed / tray service',
    options: [
      { label: 'Charcuterie Cups (All Seasons)', style: 'Tray service' },
      { label: 'Canapes (All Seasons)', style: 'Tray service' },
      { label: 'Street Food', style: 'Tray service' },
      { label: 'Substantial Canapes (All Seasons)', style: 'Tray service' },
      { label: 'Bowl Food (All Seasons)', style: 'Tray service' },
    ],
  },
  {
    id: 'stations',
    label: 'Stations',
    description: 'Chef-led / assisted / grazing stations',
    options: [
      { label: 'Charcuterie Station (All Seasons)', style: 'Self service / Stylized Grazing Station' },
      { label: 'Burger Station', style: 'Chef-Led Station with assisted service' },
      { label: 'Traditional Pie Station', style: 'Station' },
      { label: 'Street Food Station (All Seasons)', style: 'Station' },
      { label: 'Barbecue', style: 'Assisted station' },
    ],
  },
  {
    id: 'buffet',
    label: 'Buffets & Grazing',
    description: 'Self-serve buffets',
    options: [
      { label: 'Light Bites (All Seasons)', style: 'Grazing Buffet' },
      { label: 'Hot Fork Buffet (All Seasons)', style: 'Buffet' },
    ],
  },
  {
    id: 'seated',
    label: 'Seated Dining',
    description: 'Plated courses',
    options: [
      { label: 'Two Course Seated Dinner - Main & Dessert (All Seasons)', style: 'Main and Dessert' },
      { label: 'Two Course Seated Dinner - Starter & Main (All Seasons)', style: 'Starter and Main' },
      { label: 'Three Course Seated Dinner (All Seasons)', style: '3 course Seated Dinner' },
      { label: 'Fine Dining', style: 'Fine Dining' },
    ],
  },
  {
    id: 'daytime',
    label: 'Daytime & Breakfast',
    description: 'Morning / afternoon menus',
    options: [
      { label: 'Continental Breakfast', style: 'Breakfast' },
      { label: 'Brunch / English Breakfast', style: 'Brunch' },
      { label: 'Afternoon Tea', style: 'Afternoon' },
    ],
  },
];

/** Flat list of all menu labels (Settings photos, finance lookups, legacy). */
export const MENU_TYPES: string[] = MENU_GROUPS.flatMap((g) => g.options.map((o) => o.label));

export function findMenuGroupId(optionLabel: string): string | undefined {
  return MENU_GROUPS.find((g) => g.options.some((o) => o.label === optionLabel))?.id;
}

/* ─── Photo storage keyed per individual option (e.g. "vesselType::WEOTT I (Rose)") ─── */
export type PhotoMap = Record<string, string>;

export function photoKey(field: string, option: string) {
  return `${field}::${option}`;
}

export function loadFieldPhotos(): PhotoMap {
  try {
    return JSON.parse(localStorage.getItem('nexus_field_photos') || '{}');
  } catch {
    return {};
  }
}

export function saveFieldPhotos(photos: PhotoMap) {
  localStorage.setItem('nexus_field_photos', JSON.stringify(photos));
}

/** Read a stored preview photo for a specific field + option (e.g. field="vesselType", option="WEOTT I (Rose)"). */
export function getStoredPreview(field: string | null, option: string | null): string | null {
  if (!field || !option) return null;
  return loadFieldPhotos()[photoKey(field, option)] ?? null;
}
