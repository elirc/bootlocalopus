import { useEffect, useRef } from 'react';

const isObjectLike = (value) => typeof value === 'object' && value !== null;

function shallowEqual(a, b) {
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]));
}

function reasonFor(before, after) {
  if (typeof before === 'function' && typeof after === 'function') return 'new-function';
  if (isObjectLike(before) && isObjectLike(after) && shallowEqual(before, after)) return 'new-reference';
  return 'changed';
}

export function diffProps(prev, next) {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changes = [];
  for (const prop of keys) {
    const inPrev = Object.prototype.hasOwnProperty.call(prev, prop);
    const inNext = Object.prototype.hasOwnProperty.call(next, prop);
    if (!inPrev) changes.push({ prop, reason: 'added' });
    else if (!inNext) changes.push({ prop, reason: 'removed' });
    // Object.is is exactly what memo uses: NaN equals NaN, and a new object
    // is different even when its contents are not.
    else if (!Object.is(prev[prop], next[prop])) changes.push({ prop, reason: reasonFor(prev[prop], next[prop]) });
  }
  return changes.sort((a, b) => (a.prop < b.prop ? -1 : a.prop > b.prop ? 1 : 0));
}

export function useWhyRender(name, props, report) {
  const previous = useRef(null);

  // No dependency array: runs after every commit. Reporting from an effect
  // (not during render) means a render React threw away is never reported,
  // and the DOM already shows the render being explained.
  useEffect(() => {
    if (previous.current !== null) report(name, diffProps(previous.current, props));
    previous.current = props;
  });
}
