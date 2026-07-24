import React, { useEffect, useRef, useState } from 'react';

export default function DeferredSection({
  children,
  fallback = null,
  minHeight = 1,
  rootMargin = '300px 0px',
}) {
  const hostRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (shouldRender) return undefined;
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return undefined;
    }
    const node = hostRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldRender(true);
        observer.disconnect();
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  return (
    <div ref={hostRef}>
      {shouldRender ? children : (fallback ?? <div style={{ minHeight }} aria-hidden="true" />)}
    </div>
  );
}
