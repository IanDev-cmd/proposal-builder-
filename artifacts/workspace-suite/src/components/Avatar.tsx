import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Circular/square avatar with a two-stage image fallback: it tries `src`
 * first (e.g. a Gravatar photo), then `fallbackSrc` (e.g. a generated
 * DiceBear illustration) if that 404s or fails to load, and only drops to
 * a plain initials/text badge if both image sources are unavailable.
 * Used everywhere a person or company avatar is rendered so real photos
 * show up consistently across the app.
 */
export function Avatar({
  src,
  fallbackSrc,
  alt,
  fallbackText,
  className = '',
  rounded = true,
}: {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  fallbackText: string;
  className?: string;
  rounded?: boolean;
}) {
  const candidates = [src, fallbackSrc].filter((s): s is string => Boolean(s));
  const [index, setIndex] = useState(0);

  // Reset back to the first candidate when the underlying sources change
  // (e.g. a different lead is now rendered by this same element).
  useEffect(() => setIndex(0), [src, fallbackSrc]);

  const current = candidates[index];

  if (!current) {
    return (
      <div
        className={cn('flex items-center justify-center bg-[#2ecc71] text-white font-bold', rounded && 'rounded-full', className)}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={alt}
      onError={() => setIndex((i) => i + 1)}
      className={cn('object-cover', rounded && 'rounded-full', className)}
    />
  );
}

export default Avatar;
