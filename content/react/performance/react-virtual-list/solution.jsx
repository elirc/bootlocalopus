import { useState } from 'react';

export function VirtualList({ items, itemHeight, height, overscan = 3, renderItem, label }) {
  const [scrollTop, setScrollTop] = useState(0);

  const count = items.length;
  const totalHeight = count * itemHeight;

  // The list may have shrunk while the user was scrolled far down. A browser
  // clamps its own scrollTop, but the value we stored is stale: clamp it too,
  // or the window lands past the end and renders nothing.
  const maxScroll = Math.max(0, totalHeight - height);
  const top = Math.min(scrollTop, maxScroll);

  const firstVisible = Math.floor(top / itemHeight);
  const endVisible = Math.ceil((top + height) / itemHeight); // exclusive
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, endVisible + overscan);

  const rows = [];
  for (let index = start; index < end; index++) {
    rows.push(
      // Key by the item's absolute index, not its position in the window:
      // a row that stays on screen while scrolling keeps its DOM node.
      <div
        key={index}
        role="listitem"
        aria-posinset={index + 1}
        aria-setsize={count}
        style={{ position: 'absolute', top: index * itemHeight, height: itemHeight, left: 0, right: 0 }}
      >
        {renderItem(items[index], index)}
      </div>,
    );
  }

  return (
    <div
      role="list"
      aria-label={label}
      style={{ height, overflowY: 'auto', position: 'relative' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      {/* Full-height spacer: gives the scrollbar the size of the whole list. */}
      <div style={{ height: totalHeight, position: 'relative' }}>{rows}</div>
    </div>
  );
}
