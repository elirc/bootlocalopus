const { createWaitlist } = solution;
const person = (id) => ({ id, name: id.toUpperCase(), email: `${id}@example.com` });
const ids = (list) => list.map((p) => p.id);
/** Try to break the module from outside; a TypeError from a frozen object is fine too. */
const attempt = (fn) => { try { fn(); } catch { /* frozen: that is one right answer */ } };

const filled = (capacity, n) => {
  const w = createWaitlist({ capacity });
  for (let i = 1; i <= n; i++) w.join(person('p' + i));
  return w;
};

describe('joining and leaving', () => {
  it('confirms up to capacity, then waitlists with a 1-based position', () => {
    const w = createWaitlist({ capacity: 2 });
    expect(w.join(person('ada'))).toEqual({ status: 'confirmed' });
    expect(w.join(person('bob'))).toEqual({ status: 'confirmed' });
    expect(w.join(person('cy'))).toEqual({ status: 'waitlisted', position: 1 });
    expect(w.join(person('di'))).toEqual({ status: 'waitlisted', position: 2 });
    expect(ids(w.attendees())).toEqual(['ada', 'bob']);
    expect(ids(w.waiting())).toEqual(['cy', 'di']);
    expect(w.attendees()[0]).toEqual({ id: 'ada', name: 'ADA', email: 'ada@example.com' });
  });

  it('rejects a second join by the same id, confirmed or waiting', () => {
    const w = filled(1, 2);
    expect(() => w.join(person('p1'))).toThrow(Error);
    expect(() => w.join({ ...person('p2'), name: 'Other name' })).toThrow(Error);
    expect(ids(w.attendees())).toEqual(['p1']);
    expect(ids(w.waiting())).toEqual(['p2']);
  });

  it('promotes the first waiting person when an attendee leaves', () => {
    const w = filled(2, 4);
    expect(w.leave('p1')).toEqual({ removed: true, promoted: ['p3'] });
    expect(ids(w.attendees())).toEqual(['p2', 'p3']);
    expect(ids(w.waiting())).toEqual(['p4']);
    expect(w.statusOf('p4')).toEqual({ status: 'waitlisted', position: 1 });
  });

  it('does not promote when someone leaves the waitlist', () => {
    const w = filled(1, 3);
    expect(w.leave('p2')).toEqual({ removed: true, promoted: [] });
    expect(ids(w.attendees())).toEqual(['p1']);
    expect(ids(w.waiting())).toEqual(['p3']);
  });

  it('reports an unknown id without throwing', () => {
    const w = filled(1, 1);
    expect(w.leave('nobody')).toEqual({ removed: false, promoted: [] });
    expect(w.statusOf('nobody')).toBeNull();
    expect(w.statusOf('p1')).toEqual({ status: 'confirmed' });
  });

  it('lets a person who left join again, at the back', () => {
    const w = filled(1, 2);
    w.leave('p1');
    expect(w.join(person('p1'))).toEqual({ status: 'waitlisted', position: 1 });
  });
});

describe('capacity', () => {
  it('rejects a capacity that is not a positive integer', () => {
    expect(() => createWaitlist({ capacity: 0 })).toThrow(RangeError);
    expect(() => createWaitlist({ capacity: 2.5 })).toThrow(RangeError);
    expect(() => createWaitlist({ capacity: '3' })).toThrow(RangeError);
  });

  it('raising it promotes waiting people in order and reports who', () => {
    const w = filled(1, 4);
    expect(w.setCapacity(3)).toEqual(['p2', 'p3']);
    expect(ids(w.attendees())).toEqual(['p1', 'p2', 'p3']);
    expect(w.capacity).toBe(3);
  });

  it('refuses to drop below the number already confirmed, and changes nothing', () => {
    const w = filled(3, 3);
    expect(() => w.setCapacity(2)).toThrow(RangeError);
    expect(w.capacity).toBe(3);
    expect(() => w.setCapacity(-1)).toThrow(RangeError);
    expect(w.setCapacity(3)).toEqual([]);
  });

  it('cannot be changed by assigning the property', () => {
    const w = filled(1, 2);
    attempt(() => { w.capacity = 50; });
    expect(w.capacity).toBe(1);
    expect(w.join(person('p9')).status).toBe('waitlisted');
  });
});

describe('nothing you are handed lets you break the rules', () => {
  it('mutating the returned arrays does not change the waitlist', () => {
    const w = filled(2, 3);
    attempt(() => w.attendees().push(person('mallory')));
    attempt(() => w.attendees().length = 0);
    attempt(() => w.waiting().splice(0, 1));
    expect(ids(w.attendees())).toEqual(['p1', 'p2']);
    expect(ids(w.waiting())).toEqual(['p3']);
  });

  it('mutating a returned person does not change the stored one', () => {
    const w = filled(1, 2);
    attempt(() => { w.attendees()[0].id = 'mallory'; });
    attempt(() => { w.waiting()[0].name = 'Mallory'; });
    expect(w.statusOf('p1')).toEqual({ status: 'confirmed' });
    expect(w.statusOf('mallory')).toBeNull();
    expect(w.waiting()[0].name).toBe('P2');
  });

  it('mutating the object you passed to join() afterwards changes nothing', () => {
    const w = createWaitlist({ capacity: 1 });
    const me = person('ada');
    w.join(me);
    me.id = 'eve';
    me.name = 'Eve';
    expect(ids(w.attendees())).toEqual(['ada']);
    expect(w.attendees()[0].name).toBe('ADA');
    expect(w.statusOf('eve')).toBeNull();
  });

  it('keeps confirmed attendees within capacity through any sequence of calls', () => {
    const w = createWaitlist({ capacity: 3 });
    const ops = [
      () => w.join(person('a')), () => w.join(person('b')), () => w.join(person('c')),
      () => w.join(person('d')), () => w.join(person('e')), () => w.leave('b'),
      () => w.setCapacity(4), () => w.leave('a'), () => w.join(person('f')),
      () => attempt(() => w.attendees().push(person('x'))), () => w.leave('zzz'),
      () => w.join(person('g')), () => w.leave('d'),
    ];
    for (const op of ops) {
      op();
      expect(w.attendees().length).toBeLessThanOrEqual(w.capacity);
      const all = [...ids(w.attendees()), ...ids(w.waiting())];
      expect(new Set(all).size).toBe(all.length);
      if (w.waiting().length > 0) expect(w.attendees().length).toBe(w.capacity);
    }
    expect(ids(w.attendees())).toEqual(['c', 'e', 'f', 'g']);
  });
});
