import { useEffect, useRef } from 'react';

export function Layout({ routeKey, title, siteName = 'Acme', nav, children }) {
  // TODO: a skip link, document.title, and focus on the heading when the
  // route changes (and only then).
  return (
    <div>
      <nav aria-label="Main">{nav}</nav>
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
