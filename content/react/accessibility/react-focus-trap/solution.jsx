import { useEffect, useRef } from 'react';

const CANDIDATES = 'a[href], button, input, select, textarea, [tabindex]';

function tabbables(container) {
  return [...container.querySelectorAll(CANDIDATES)].filter(
    (el) =>
      !el.disabled &&
      el.getAttribute('tabindex') !== '-1' &&
      !(el.tagName === 'INPUT' && el.type === 'hidden') &&
      !el.closest('[hidden]'),
  );
}

export function FocusTrap({ active = true, initialFocusRef, children }) {
  const container = useRef(null);

  // Runs when `active` changes, and only then: re-running on every render
  // would steal focus back to the first field while the user is typing.
  // A passive effect, not a layout effect: a layout effect cleanup runs in
  // the middle of React's commit, and React then restores the focus it saw
  // before the commit, silently undoing the hand-back below.
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    const root = container.current;
    const target = initialFocusRef?.current ?? tabbables(root)[0] ?? root;
    target.focus();

    return () => {
      // Deactivated or unmounted: hand focus back to where it came from.
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
    };
  }, [active]);

  const onKeyDown = (event) => {
    if (!active || event.key !== 'Tab') return;
    const root = container.current;
    // Computed now, not on mount: the content may have changed since.
    const list = tabbables(root);
    if (list.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || current === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || current === root)) {
      event.preventDefault();
      first.focus();
    }
    // Anywhere in the middle: the browser's own Tab order is right.
  };

  return (
    <div ref={container} tabIndex={-1} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
