import { useState } from 'react';
import './servant-filter-icon.css';

export function ServantFilterIcon({
  src,
  fallback,
  className,
}: {
  src: string;
  fallback: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className={`${className} filter-icon-fallback`} aria-hidden="true">
      {fallback}
    </span>
  ) : (
    <img
      className={className}
      src={src}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}
