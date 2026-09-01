/**
 * Deleted quote ids stay hidden even if IndexedDB or the engine
 * still return the row. Persist/upsert removes an id so Save Quote can reuse it.
 */
const KEY = 'nexus_deleted_quote_ids';

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.map((id) => String(id || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* quota — memory + IndexedDB delete still apply this session */
  }
}

export function listDeletedQuoteIds(): Set<string> {
  return new Set(readIds());
}

export function isQuoteDeleted(id: string | undefined | null): boolean {
  const value = String(id || '').trim();
  return Boolean(value) && listDeletedQuoteIds().has(value);
}

export function rememberDeletedQuoteIds(ids: Array<string | undefined | null>): void {
  const next = readIds();
  for (const id of ids) {
    const value = String(id || '').trim();
    if (value) next.push(value);
  }
  writeIds(next);
}

export function forgetDeletedQuoteIds(ids: Array<string | undefined | null>): void {
  const drop = new Set(
    ids.map((id) => String(id || '').trim()).filter(Boolean),
  );
  if (!drop.size) return;
  writeIds(readIds().filter((id) => !drop.has(id)));
}
