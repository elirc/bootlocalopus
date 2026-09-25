import { useEffect, useRef } from 'react';

export function FocusTrap({ active = true, initialFocusRef, children }) {
  const container = useRef(null);

  // TODO: focus in on activation, wrap Tab and Shift+Tab at the edges, and
  // give focus back on deactivation.
  return (
    <div ref={container} tabIndex={-1}>
      {children}
    </div>
  );
}
