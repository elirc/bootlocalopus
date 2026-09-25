import { useEffect, useRef } from 'react';

export function Layout({ routeKey, title, siteName = 'Acme', nav, children }) {
  const mainRef = useRef(null);
  const headingRef = useRef(null);
  // The route we last moved focus for. Starting it at the current route is
  // what makes the first render a no-op, and unlike an "is first run" flag it
  // stays correct when StrictMode runs the effect twice.
  const lastRoute = useRef(routeKey);

  useEffect(() => {
    document.title = `${title} · ${siteName}`;
  }, [title, siteName]);

  useEffect(() => {
    if (lastRoute.current === routeKey) return;
    lastRoute.current = routeKey;
    // A new page: start the user at its heading, which a screen reader reads
    // out, instead of on a link that may no longer exist.
    headingRef.current?.focus();
  }, [routeKey]);

  const skipToMain = (event) => {
    event.preventDefault();
    mainRef.current?.focus();
  };

  return (
    <div>
      <a href="#main-content" onClick={skipToMain}>
        Skip to main content
      </a>
      <nav aria-label="Main">{nav}</nav>
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        <h1 ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}
