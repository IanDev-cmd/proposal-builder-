/**
 * Proposal package column wording keyed by gold scenario ref (matches testing zip PDFs).
 */
import goldPackageWording from '@/lib/assets/goldPackageWording.json';

export type PackageWordingColumns = Record<
  string,
  { heading: string; items: string[] }[]
>;

const WORDING = goldPackageWording as Record<string, PackageWordingColumns>;

export function goldPackageWordingForRef(ref?: string | null): PackageWordingColumns | null {
  if (!ref) return null;
  return WORDING[ref] || null;
}
