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

export const MENU_TYPES = ['Summer Barbecue', 'Street Food', 'Canapés', '2-Course Seated Dinner'];

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
