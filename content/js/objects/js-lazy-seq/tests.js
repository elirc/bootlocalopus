const { Seq } = solution;

// A re-iterable source that counts pulls and records when it is closed.
// It stops after `limit` items so an eager implementation fails instead of hanging.
function tracked(limit = 1000) {
  const log = { opened: 0, pulled: 0, closed: 0 };
  const iterable = {
    *[Symbol.iterator]() {
      log.opened++;
      try {
        for (let i = 1; i <= limit; i++) {
          log.pulled++;
          yield i;
        }
      } finally {
        log.closed++;
      }
    },
  };
  return { iterable, log };
}

describe('iterable protocol', () => {
  it('a Seq works with for...of and spread', () => {
    const seq = Seq.from([1, 2, 3]);
    const seen = [];
    for (const x of seq) seen.push(x);
    expect(seen).toEqual([1, 2, 3]);
    expect([...seq]).toEqual([1, 2, 3]);
  });

  it('accepts any iterable: Set, generator object, custom iterable', () => {
    expect(Seq.from(new Set(['a', 'b'])).toArray()).toEqual(['a', 'b']);
    function* gen() { yield 1; yield 2; }
    expect(Seq.from(gen()).toArray()).toEqual([1, 2]);
    expect(Seq.from(tracked(3).iterable).toArray()).toEqual([1, 2, 3]);
  });

  it('can be iterated more than once', () => {
    const seq = Seq.from([1, 2, 3]).map((x) => x * 10);
    expect(seq.toArray()).toEqual([10, 20, 30]);
    expect(seq.toArray()).toEqual([10, 20, 30]);
    expect([...seq]).toEqual([10, 20, 30]);
  });
});

describe('map / filter', () => {
  it('transform and pass (value, index)', () => {
    const calls = [];
    const out = Seq.from(['a', 'b', 'c', 'd'])
      .filter((v, i) => { calls.push(['filter', v, i]); return v !== 'b'; })
      .map((v, i) => `${i}:${v}`)
      .toArray();
    expect(out).toEqual(['0:a', '1:c', '2:d']);
    expect(calls).toEqual([['filter', 'a', 0], ['filter', 'b', 1], ['filter', 'c', 2], ['filter', 'd', 3]]);
  });

  it('return a new Seq and leave the original alone', () => {
    const base = Seq.from([1, 2, 3]);
    const doubled = base.map((x) => x * 2);
    const odd = base.filter((x) => x % 2);
    expect(doubled).not.toBe(base);
    expect(base.toArray()).toEqual([1, 2, 3]);
    expect(doubled.toArray()).toEqual([2, 4, 6]);
    expect(odd.toArray()).toEqual([1, 3]);
  });

  it('are lazy: nothing runs until something iterates', () => {
    const { iterable, log } = tracked();
    let calls = 0;
    const seq = Seq.from(iterable).map((x) => { calls++; return x; }).filter(() => true);
    expect(calls).toBe(0);
    expect(log.opened).toBe(0);
    expect(log.pulled).toBe(0);
    seq.take(1).toArray();
    expect(calls).toBe(1);
  });
});

describe('take', () => {
  it('pulls exactly as many items as it yields', () => {
    const { iterable, log } = tracked();
    let mapped = 0;
    const out = Seq.from(iterable).map((x) => { mapped++; return x * 2; }).take(3).toArray();
    expect(out).toEqual([2, 4, 6]);
    expect(log.pulled).toBe(3);
    expect(mapped).toBe(3);
  });

  it('closes the source when it stops early', () => {
    const { iterable, log } = tracked();
    Seq.from(iterable).map((x) => x).take(2).toArray();
    expect(log.closed).toBe(1);
  });

  it('take(0) never touches the source', () => {
    const { iterable, log } = tracked();
    expect(Seq.from(iterable).take(0).toArray()).toEqual([]);
    expect(log.pulled).toBe(0);
  });

  it('take(n) past the end just returns everything', () => {
    expect(Seq.from([1, 2]).take(5).toArray()).toEqual([1, 2]);
  });

  it('take after filter stops as soon as it has enough', () => {
    const { iterable, log } = tracked();
    const out = Seq.from(iterable).filter((x) => x % 2 === 0).take(2).toArray();
    expect(out).toEqual([2, 4]);
    expect(log.pulled).toBe(4);
  });

  it('a taken Seq is re-iterable and reopens the source each time', () => {
    const { iterable, log } = tracked();
    const firstTwo = Seq.from(iterable).take(2);
    expect(firstTwo.toArray()).toEqual([1, 2]);
    expect(firstTwo.toArray()).toEqual([1, 2]);
    expect(log.opened).toBe(2);
    expect(log.closed).toBe(2);
  });
});

describe('first and early exit', () => {
  it('first() pulls one item and closes the source', () => {
    const { iterable, log } = tracked();
    expect(Seq.from(iterable).map((x) => x + 100).first()).toBe(101);
    expect(log.pulled).toBe(1);
    expect(log.closed).toBe(1);
  });

  it('first() of an empty Seq is undefined', () => {
    expect(Seq.from([]).first()).toBeUndefined();
    expect(Seq.from([1]).filter(() => false).first()).toBeUndefined();
  });

  it('a break in the caller closes the source through map and filter', () => {
    const { iterable, log } = tracked();
    for (const x of Seq.from(iterable).map((v) => v).filter(() => true)) {
      if (x === 3) break;
    }
    expect(log.pulled).toBe(3);
    expect(log.closed).toBe(1);
  });
});
