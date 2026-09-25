import { useLayoutEffect, useRef, useState } from 'react';

const isParent = (node) => Array.isArray(node.children) && node.children.length > 0;

/** The visible nodes in document order, each with its parent's id. */
function visibleNodes(nodes, expanded, parentId = null, out = []) {
  for (const node of nodes) {
    out.push({ node, parentId });
    if (isParent(node) && expanded.has(node.id)) visibleNodes(node.children, expanded, node.id, out);
  }
  return out;
}

export function TreeView({ label, nodes, onSelect }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [focusedId, setFocusedId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const items = useRef(new Map());
  // Set when a key or click should move real focus; applied after render,
  // once the target element exists.
  const focusPending = useRef(false);

  const visible = visibleNodes(nodes, expanded);
  // The tab stop falls back to the first node if the focused one is gone
  // (for example, `nodes` changed under it).
  const tabStop = visible.some((v) => v.node.id === focusedId) ? focusedId : visible[0]?.node.id;

  useLayoutEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    items.current.get(tabStop)?.focus();
  });

  const focusNode = (id) => {
    focusPending.current = true;
    setFocusedId(id);
  };

  const setOpen = (id, open) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const select = (id) => {
    setSelectedId(id);
    onSelect?.(id);
  };

  const onKeyDown = (event) => {
    const index = visible.findIndex((v) => v.node.id === tabStop);
    if (index === -1) return;
    const { node, parentId } = visible[index];
    const open = expanded.has(node.id);
    let handled = true;

    switch (event.key) {
      case 'ArrowDown':
        if (index < visible.length - 1) focusNode(visible[index + 1].node.id);
        break;
      case 'ArrowUp':
        if (index > 0) focusNode(visible[index - 1].node.id);
        break;
      case 'ArrowRight':
        if (isParent(node) && !open) setOpen(node.id, true);
        else if (isParent(node)) focusNode(node.children[0].id);
        break;
      case 'ArrowLeft':
        if (isParent(node) && open) setOpen(node.id, false);
        else if (parentId !== null) focusNode(parentId);
        break;
      case 'Home':
        focusNode(visible[0].node.id);
        break;
      case 'End':
        focusNode(visible[visible.length - 1].node.id);
        break;
      case 'Enter':
      case ' ':
        select(node.id);
        break;
      default:
        handled = false;
    }

    if (!handled && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      handled = true;
      const char = event.key.toLowerCase();
      for (let step = 1; step <= visible.length; step++) {
        const candidate = visible[(index + step) % visible.length].node;
        if (candidate.label.toLowerCase().startsWith(char)) {
          focusNode(candidate.id);
          break;
        }
      }
    }

    if (handled) event.preventDefault();
  };

  const renderNodes = (list, level) =>
    list.map((node, index) => {
      const parent = isParent(node);
      const open = parent && expanded.has(node.id);
      return (
        <li
          key={node.id}
          ref={(el) => {
            if (el) items.current.set(node.id, el);
            else items.current.delete(node.id);
          }}
          role="treeitem"
          aria-label={node.label}
          aria-level={level}
          aria-setsize={list.length}
          aria-posinset={index + 1}
          aria-selected={node.id === selectedId ? 'true' : 'false'}
          aria-expanded={parent ? (open ? 'true' : 'false') : undefined}
          tabIndex={node.id === tabStop ? 0 : -1}
          onClick={(event) => {
            // Items are nested: without this, a click on a file would also
            // toggle and select every folder above it.
            event.stopPropagation();
            focusNode(node.id);
            select(node.id);
            if (parent) setOpen(node.id, !open);
          }}
        >
          <span>{node.label}</span>
          {open && <ul role="group">{renderNodes(node.children, level + 1)}</ul>}
        </li>
      );
    });

  // One handler at the root: key events from nested items bubble here, and
  // the focused node is known from state, so nothing is handled twice.
  return (
    <ul role="tree" aria-label={label} onKeyDown={onKeyDown}>
      {renderNodes(nodes, 1)}
    </ul>
  );
}
