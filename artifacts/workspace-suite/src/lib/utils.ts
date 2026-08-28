import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatGbp(value: unknown): string {
  return `£${money(value).toFixed(2)}`;
}

/** Client-facing totals (margin, cost to client, VAT, grand) — whole pounds. */
export function formatGbpPounds(value: unknown): string {
  const n = money(value);
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}
