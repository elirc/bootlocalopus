Rendering 10,000 rows means 10,000 DOM nodes, and every one of them is laid
out, painted and diffed on each update. Memo cannot fix that: the fix is to
render only the rows that are on screen, and a few either side so a fast
scroll does not flash blank space.

jsdom (and a server render) has no layout, so this list cannot measure
anything. It is told its row height and its viewport height as props, which
is also what the popular libraries do for fixed-height rows.

## Task

Export `VirtualList({ items, itemHeight, height, overscan = 3, renderItem, label })`.

**Structure** (all checked)

```
<div role="list" aria-label={label}                 ← the scroll container
     style: height, overflowY: 'auto', position: 'relative'
     onScroll → read event.currentTarget.scrollTop>
  <div style: height = items.length * itemHeight>   ← its only child: a full-height spacer
    <div role="listitem"                            ← one per rendered row
         aria-posinset={index + 1} aria-setsize={items.length}
         style: position 'absolute', top = index * itemHeight, height = itemHeight>
      {renderItem(item, index)}
```

The spacer gives the scrollbar the size of the whole list; each row sits at
its real offset inside it. `aria-posinset`/`aria-setsize` tell a screen reader
"row 51 of 10,000" even though only a dozen rows exist in the DOM.

**Which rows** (all indexes 0-based, `end` exclusive)

```
firstVisible = floor(scrollTop / itemHeight)
endVisible   = ceil((scrollTop + height) / itemHeight)
start        = max(0, firstVisible - overscan)
end          = min(items.length, endVisible + overscan)
```

- Call `renderItem` **only** for the rows you render. Mapping all 10,000 items
  and hiding most of them is exactly the cost you are removing.
- **Key each row by its item index**, not its position in the window. Keyed
  by window position, scrolling one row moves every row's content into a
  different DOM node, so any row-local state or focus jumps to another item.
- **The trap:** if `items` shrinks while the user is scrolled far down, the
  `scrollTop` you stored is past the end, and the window is empty. A browser
  clamps its own scroll position; clamp yours too, to
  `max(0, items.length * itemHeight - height)`.
