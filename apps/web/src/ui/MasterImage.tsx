import { useState } from 'react';

export function MasterImage({
  src,
  alt,
  fallback,
  className = '',
}: {
  src: string | null;
  alt: string;
  fallback: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`image-frame ${className}`.trim()} aria-hidden={alt ? undefined : 'true'}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span>{fallback.slice(0, 1)}</span>
      )}
    </span>
  );
}
