import { match, matchOr, isKind } from './solution';
import type { Handlers } from './solution';

type Circle = { kind: 'circle'; radius: number };
type Rect = { kind: 'rect'; width: number; height: number };
type Triangle = { kind: 'triangle'; base: number; height: number };
type Shape = Circle | Rect | Triangle;
declare const shape: Shape;
declare const shapes: Shape[];

// --- match: one handler per variant, each narrowed, no annotations
const area = match(shape, {
  circle: (c) => Math.PI * c.radius ** 2,
  rect: (r) => r.width * r.height,
  triangle: (t) => {
    type _t = Expect<Equal<typeof t, Triangle>>;
    return (t.base * t.height) / 2;
  },
});
type _area = Expect<Equal<typeof area, number>>;

// @ts-expect-error triangle is not handled
match(shape, { circle: (c) => c.radius, rect: (r) => r.width });
// @ts-expect-error there is no hexagon
match(shape, { circle: () => 1, rect: () => 2, triangle: () => 3, hexagon: () => 4 });
// @ts-expect-error a circle has no width
match(shape, { circle: (c) => c.width, rect: (r) => r.width, triangle: (t) => t.base });

// Handlers may return different types; the result is their union.
const mixed = match(shape, { circle: () => 1, rect: () => 'boxy', triangle: () => null });
type _mixed = Expect<Equal<typeof mixed, number | string | null>>;

type _handlers = Expect<Equal<keyof Handlers<Shape, void>, 'circle' | 'rect' | 'triangle'>>;
type _handler = Expect<Equal<Parameters<Handlers<Shape, void>['rect']>[0], Rect>>;

// It works for any union with a `kind`.
type Event = { kind: 'click'; x: number } | { kind: 'key'; code: string };
declare const ev: Event;
const text = match(ev, { click: (e) => `at ${e.x}`, key: (e) => e.code });
type _text = Expect<Equal<typeof text, string>>;

// @ts-expect-error only tagged values
match(42, {});

// --- matchOr: the fallback only sees what was not handled
const perimeterOrZero = matchOr(
  shape,
  { circle: (c) => 2 * Math.PI * c.radius },
  (rest) => {
    type _rest = Expect<Equal<typeof rest, Rect | Triangle>>;
    return 0;
  },
);
type _perimeter = Expect<Equal<typeof perimeterOrZero, number>>;

matchOr(shape, { circle: () => 'c', rect: () => 'r' }, (rest) => {
  type _rest = Expect<Equal<typeof rest, Triangle>>;
  return rest.base > 0 ? 'wide' : 'flat';
});
matchOr(shape, {}, (rest) => {
  type _all = Expect<Equal<typeof rest, Shape>>;
  return 0;
});
// @ts-expect-error no such kind
matchOr(shape, { square: () => 1 }, () => 0);
// @ts-expect-error the fallback cannot read a circle's radius: circles were handled
matchOr(shape, { circle: () => 1 }, (rest) => rest.radius);

// --- isKind: a reusable type predicate
const circles = shapes.filter(isKind('circle'));
type _circles = Expect<Equal<typeof circles, Circle[]>>;
if (isKind('rect')(shape)) {
  const w: number = shape.width;
}
