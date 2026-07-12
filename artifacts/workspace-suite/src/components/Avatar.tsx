import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Circular/square avatar that pings a real photo (via `src`) and falls back
 * to an initials/text badge if the image 404s or the person has no photo
 * source. Used everywhere a person or company avatar is rendered so real
 * photos show up consistently across the app.
 */
export function Avatar({
  src,
  alt,
  fallbackText,
  className = '',
  rounded = true,
}: {
  src: string;
  alt: string;
  fallbackText: string;
  className?: string;
  rounded?: boolean;
}) {
  const [errored, setErrored] = useState(false);

  // Reset error state when the underlying source changes (e.g. a different lead).
  useEffect(() => setErrored(false), [src]);

  if (errored || !src) {
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
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className={cn('object-cover', rounded && 'rounded-full', className)}
    />
  );
}

export default Avatar;
