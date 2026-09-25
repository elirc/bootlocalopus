import { useState } from 'react';

export function VirtualList({ items, itemHeight, height, overscan = 3, renderItem, label }) {
  const [scrollTop, setScrollTop] = useState(0);

  // TODO: work out which rows are on screen (plus overscan) and render only
  // those, each absolutely positioned inside a full-height spacer.
  return (
    <div
      role="list"
      aria-label={label}
      style={{ height, overflowY: 'auto', position: 'relative' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div />
    </div>
  );
}
