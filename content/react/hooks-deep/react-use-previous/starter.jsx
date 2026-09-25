import { useRef, useState, useEffect, useLayoutEffect } from 'react';

export function usePrevious(value) {
  // TODO: return the value from the previous committed render
  return value;
}

export function useLatest(value) {
  // TODO: a stable ref whose .current is the latest committed value
  return { current: undefined };
}

export function PriceTicker({ price }) {
  // TODO: 'up' / 'down' for the last change, '' before any change
  return (
    <div>
      <span data-testid="price">{price}</span>
      <span data-testid="trend"></span>
    </div>
  );
}
