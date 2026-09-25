const attempt = async (sql, params) => {
  await q('savepoint probe');
  try {
    await q(sql, params);
    await q('release savepoint probe');
    return null;
  } catch (e) {
    await q('rollback to savepoint probe');
    return e;
  }
};

const room = async (name) => num((await q('select id from rooms where name = $1', [name]))[0].id);
const range = (from, to, bounds = '[)') => `${bounds[0]}2024-05-06 ${from}:00+00,2024-05-06 ${to}:00+00${bounds[1]}`;
const book = (roomId, during, attendees = 2) => attempt(
  "insert into bookings (room_id, booked_by, attendees, during) values ($1, 'ada', $2, $3::tstzrange)",
  [roomId, attendees, during],
);
const booked = async (roomId, during, attendees = 2) => num((await q(
  "insert into bookings (room_id, booked_by, attendees, during) values ($1, 'ada', $2, $3::tstzrange) returning id",
  [roomId, attendees, during],
))[0].id);
const free = async (during, attendees) => (await q(
  'select room_id, name, capacity from free_rooms($1::tstzrange, $2)', [during, attendees],
)).map((r) => r.name);

describe('the table', () => {
  it('accepts a normal booking', async () => {
    expect(await book(await room('Attic'), range('10:00', '11:00'))).toBeNull();
  });

  it('refuses a booking for a room that does not exist', async () => {
    const err = await book(999999, range('10:00', '11:00'));
    expect(err && err.code).toBe('23503');
  });

  it('refuses to delete a room that has bookings', async () => {
    const attic = await room('Attic');
    await booked(attic, range('10:00', '11:00'));
    const err = await attempt('delete from rooms where id = $1', [attic]);
    expect(err && err.code).toBe('23503');
  });

  it('refuses zero attendees', async () => {
    const err = await book(await room('Attic'), range('10:00', '11:00'), 0);
    expect(err && err.code).toBe('23514');
  });
});

describe('the shape of during', () => {
  it('refuses an empty range', async () => {
    const err = await book(await room('Attic'), 'empty');
    expect(err && err.code).toBe('23514');
  });

  it('refuses an unbounded range', async () => {
    const err = await book(await room('Attic'), '[2024-05-06 10:00:00+00,)');
    expect(err && err.code).toBe('23514');
  });

  it('refuses closed and open bounds', async () => {
    const attic = await room('Attic');
    for (const b of ['[]', '()', '(]']) {
      const err = await book(attic, range('10:00', '11:00', b));
      expect(err && err.code).toBe('23514');
    }
  });

  it('allows exactly four hours and refuses more', async () => {
    const attic = await room('Attic');
    expect(await book(attic, range('08:00', '12:00'))).toBeNull();
    const err = await book(attic, range('13:00', '17:01'));
    expect(err && err.code).toBe('23514');
  });
});

describe('no double booking', () => {
  it('refuses an overlapping booking of the same room', async () => {
    const attic = await room('Attic');
    await booked(attic, range('10:00', '11:00'));
    const err = await book(attic, range('10:30', '11:30'));
    expect(err && err.code).toBe('23P01');
  });

  it('refuses a booking inside another one', async () => {
    const attic = await room('Attic');
    await booked(attic, range('09:00', '12:00'));
    const err = await book(attic, range('10:00', '10:15'));
    expect(err && err.code).toBe('23P01');
  });

  it('allows back-to-back bookings', async () => {
    const attic = await room('Attic');
    await booked(attic, range('10:00', '11:00'));
    expect(await book(attic, range('11:00', '12:00'))).toBeNull();
    expect(await book(attic, range('09:00', '10:00'))).toBeNull();
  });

  it('allows the same time in a different room', async () => {
    await booked(await room('Attic'), range('10:00', '11:00'));
    expect(await book(await room('Boardroom'), range('10:00', '11:00'))).toBeNull();
  });

  it('ignores cancelled bookings', async () => {
    const attic = await room('Attic');
    const id = await booked(attic, range('10:00', '11:00'));
    await q('update bookings set cancelled_at = now() where id = $1', [id]);
    expect(await book(attic, range('10:00', '11:00'))).toBeNull();
  });

  it('refuses to un-cancel a booking that now clashes', async () => {
    const attic = await room('Attic');
    const id = await booked(attic, range('10:00', '11:00'));
    await q('update bookings set cancelled_at = now() where id = $1', [id]);
    await booked(attic, range('10:30', '11:30'));
    const err = await attempt('update bookings set cancelled_at = null where id = $1', [id]);
    expect(err && err.code).toBe('23P01');
  });

  it('refuses moving a booking into a clash', async () => {
    const attic = await room('Attic');
    await booked(attic, range('10:00', '11:00'));
    const id = await booked(attic, range('12:00', '13:00'));
    const err = await attempt('update bookings set during = $1::tstzrange where id = $2', [range('10:45', '11:45'), id]);
    expect(err && err.code).toBe('23P01');
  });
});

describe('capacity', () => {
  it('allows a room filled exactly to capacity', async () => {
    expect(await book(await room('Cube'), range('10:00', '11:00'), 2)).toBeNull();
  });

  it('refuses more attendees than the room holds', async () => {
    const err = await book(await room('Cube'), range('10:00', '11:00'), 3);
    expect(err && err.code).toBe('23514');
    expect(String(err && err.message)).toContain('room capacity exceeded');
  });

  it('refuses growing a booking beyond capacity', async () => {
    const id = await booked(await room('Attic'), range('10:00', '11:00'), 4);
    const err = await attempt('update bookings set attendees = 5 where id = $1', [id]);
    expect(err && err.code).toBe('23514');
  });

  it('refuses moving a booking to a room that is too small', async () => {
    const id = await booked(await room('Boardroom'), range('10:00', '11:00'), 3);
    const err = await attempt('update bookings set room_id = $1 where id = $2', [await room('Cube'), id]);
    expect(err && err.code).toBe('23514');
  });
});

describe('free_rooms', () => {
  it('lists every room that fits, smallest first, when nothing is booked', async () => {
    expect(await free(range('10:00', '11:00'), 1)).toEqual(['Cube', 'Attic', 'Boardroom']);
    expect(await free(range('10:00', '11:00'), 3)).toEqual(['Attic', 'Boardroom']);
    expect(await free(range('10:00', '11:00'), 13)).toEqual([]);
  });

  it('leaves out rooms with an overlapping active booking', async () => {
    await booked(await room('Attic'), range('10:00', '11:00'));
    expect(await free(range('10:30', '12:00'), 1)).toEqual(['Cube', 'Boardroom']);
  });

  it('counts back-to-back as free and cancelled as free', async () => {
    const attic = await room('Attic');
    await booked(attic, range('09:00', '10:00'));
    const id = await booked(await room('Cube'), range('10:00', '11:00'));
    await q('update bookings set cancelled_at = now() where id = $1', [id]);
    expect(await free(range('10:00', '11:00'), 1)).toEqual(['Cube', 'Attic', 'Boardroom']);
  });

  it('returns room_id, name and capacity', async () => {
    const rows = await q('select * from free_rooms($1::tstzrange, 10)', [range('10:00', '11:00')]);
    expect(rows.map((r) => ({ ...r, room_id: num(r.room_id), capacity: num(r.capacity) })))
      .toEqual([{ room_id: await room('Boardroom'), name: 'Boardroom', capacity: 12 }]);
  });
});
