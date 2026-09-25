import { useLayoutEffect, useRef, useState } from 'react';

// TODO: the ARIA tree pattern. This renders the nodes and lets a mouse user
// expand them, and that is all.
function Node({ node, expanded, toggle }) {
  const isOpen = expanded.has(node.id);
  return (
    <li onClick={() => toggle(node.id)}>
      {node.label}
      {node.children?.length > 0 && isOpen && (
        <ul>
          {node.children.map((child) => (
            <Node key={child.id} node={child} expanded={expanded} toggle={toggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TreeView({ label, nodes, onSelect }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };
  return (
    <ul>
      {nodes.map((node) => (
        <Node key={node.id} node={node} expanded={expanded} toggle={toggle} />
      ))}
    </ul>
  );
}
