const assertCapacity = (capacity) => {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
};

// Callers get frozen copies: they can read everything and change nothing.
const snapshot = (person) => Object.freeze({ ...person });

export function createWaitlist({ capacity }) {
  assertCapacity(capacity);
  // The only state. Nothing below ever hands these arrays out.
  const confirmed = [];
  const waiting = [];

  const indexIn = (list, id) => list.findIndex((p) => p.id === id);

  const promote = () => {
    const promoted = [];
    while (confirmed.length < capacity && waiting.length > 0) {
      const next = waiting.shift();
      confirmed.push(next);
      promoted.push(next.id);
    }
    return promoted;
  };

  return {
    join(person) {
      if (indexIn(confirmed, person.id) !== -1 || indexIn(waiting, person.id) !== -1) {
        throw new Error(`${person.id} has already joined`);
      }
      const stored = { ...person };
      if (confirmed.length < capacity) {
        confirmed.push(stored);
        return { status: 'confirmed' };
      }
      waiting.push(stored);
      return { status: 'waitlisted', position: waiting.length };
    },

    leave(id) {
      const c = indexIn(confirmed, id);
      if (c !== -1) {
        confirmed.splice(c, 1);
        return { removed: true, promoted: promote() };
      }
      const w = indexIn(waiting, id);
      if (w !== -1) {
        waiting.splice(w, 1);
        return { removed: true, promoted: [] };
      }
      return { removed: false, promoted: [] };
    },

    setCapacity(next) {
      assertCapacity(next);
      if (next < confirmed.length) {
        throw new RangeError(`cannot reduce capacity below the ${confirmed.length} confirmed attendees`);
      }
      capacity = next;
      return promote();
    },

    statusOf(id) {
      if (indexIn(confirmed, id) !== -1) return { status: 'confirmed' };
      const w = indexIn(waiting, id);
      if (w !== -1) return { status: 'waitlisted', position: w + 1 };
      return null;
    },

    attendees: () => confirmed.map(snapshot),
    waiting: () => waiting.map(snapshot),
    get capacity() { return capacity; },
  };
}
