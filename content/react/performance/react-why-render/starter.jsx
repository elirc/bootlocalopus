import { useEffect, useRef } from 'react';

export function diffProps(prev, next) {
  // TODO: one { prop, reason } per differing prop, sorted by prop.
  throw new Error('diffProps is not implemented');
}

export function useWhyRender(name, props, report) {
  // TODO: after every re-render, report what changed since the previous one.
}
