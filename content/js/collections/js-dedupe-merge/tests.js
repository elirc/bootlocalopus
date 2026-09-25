const { mergeContacts } = solution;

describe('identity', () => {
  it('merges emails that differ only in case and surrounding spaces', () => {
    const out = mergeContacts([
      { email: 'Ana@Shop.com', name: 'Ana' },
      { email: '  ana@shop.com ', phone: '555-0101' },
      { email: 'ANA@SHOP.COM', company: 'Shop Ltd' },
    ]);
    expect(out).toStrictEqual([
      { email: 'ana@shop.com', name: 'Ana', phone: '555-0101', company: 'Shop Ltd', tags: [] },
    ]);
  });

  it('keeps different people apart, each at their first position', () => {
    const out = mergeContacts([
      { email: 'b@x.io', name: 'B' },
      { email: 'a@x.io', name: 'A' },
      { email: 'B@x.io', phone: '1' },
      { email: 'c@x.io' },
      { email: 'a@x.io', phone: '2' },
    ]);
    expect(out.map((c) => c.email)).toEqual(['b@x.io', 'a@x.io', 'c@x.io']);
    expect(out.map((c) => c.phone)).toEqual(['1', '2', null]);
  });
});

describe('fields', () => {
  it('first non-blank value wins; later rows only fill gaps', () => {
    const out = mergeContacts([
      { email: 'p@x.io', name: '  ', phone: '' },
      { email: 'p@x.io', name: '  Priya Shah ', company: 'Acme' },
      { email: 'p@x.io', name: 'P. Shah', phone: ' 555 ', company: 'Other' },
    ]);
    expect(out).toStrictEqual([
      { email: 'p@x.io', name: 'Priya Shah', phone: '555', company: 'Acme', tags: [] },
    ]);
  });

  it('fills every missing field with null and outputs exactly five keys', () => {
    const [c] = mergeContacts([{ email: 'x@y.z', extra: 'dropped', name: 42 }]);
    expect(c).toStrictEqual({ email: 'x@y.z', name: null, phone: null, company: null, tags: [] });
  });

  it('unions tags in first-seen order without duplicates', () => {
    const [c] = mergeContacts([
      { email: 't@x.io', tags: ['vip', 'eu'] },
      { email: 't@x.io' },
      { email: 'T@x.io', tags: ['eu', 'newsletter', 'vip', 'beta'] },
    ]);
    expect(c.tags).toEqual(['vip', 'eu', 'newsletter', 'beta']);
  });
});

describe('rows without a usable email', () => {
  it('are kept in position, cleaned, and never merged', () => {
    const out = mergeContacts([
      { email: 'a@x.io', name: 'A' },
      { name: ' Walk-in ', tags: ['shop', 'shop'] },
      { email: '   ', name: 'Blank' },
      { email: null, name: 'Null' },
      { email: 'A@x.io', phone: '9' },
      { name: 'Walk-in' },
    ]);
    expect(out).toStrictEqual([
      { email: 'a@x.io', name: 'A', phone: '9', company: null, tags: [] },
      { email: null, name: 'Walk-in', phone: null, company: null, tags: ['shop'] },
      { email: null, name: 'Blank', phone: null, company: null, tags: [] },
      { email: null, name: 'Null', phone: null, company: null, tags: [] },
      { email: null, name: 'Walk-in', phone: null, company: null, tags: [] },
    ]);
  });
});

describe('hygiene', () => {
  it('returns new objects and does not mutate the input', () => {
    const rows = [
      { email: ' A@x.io', name: 'A', tags: ['one'] },
      { email: 'a@x.io', phone: '1', tags: ['two'] },
    ];
    const snapshot = JSON.stringify(rows);
    const out = mergeContacts(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(out[0]).not.toBe(rows[0]);
    expect(out[0].tags).not.toBe(rows[0].tags);
    expect(out[0].tags).toEqual(['one', 'two']);
  });

  it('handles an empty list', () => {
    expect(mergeContacts([])).toEqual([]);
  });

  it('is fast on 100 000 rows (50 000 people)', () => {
    const rows = [];
    for (let i = 0; i < 100_000; i++) {
      const n = i % 50_000;
      rows.push(i < 50_000 ? { email: `User${n}@Example.com`, name: `U${n}` } : { email: `user${n}@example.com `, phone: `${n}` });
    }
    const out = mergeContacts(rows);
    expect(out).toHaveLength(50_000);
    expect(out[123]).toStrictEqual({ email: 'user123@example.com', name: 'U123', phone: '123', company: null, tags: [] });
  });
});
