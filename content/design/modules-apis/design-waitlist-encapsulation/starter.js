// The first version: a plain object with its arrays on show. Checkout code
// reads `list.confirmed.length`, the admin page pushes straight into
// `list.queue`, and last week somebody ran `list.capacity = 500`. Nobody
// can say any more which rules hold.

export function createWaitlist({ capacity }) {
  const list = {
    capacity,
    confirmed: [],
    queue: [],
    join(person) {
      throw new Error('TODO');
    },
    leave(id) {
      throw new Error('TODO');
    },
    setCapacity(next) {
      throw new Error('TODO');
    },
    statusOf(id) {
      throw new Error('TODO');
    },
    attendees: () => list.confirmed,
    waiting: () => list.queue,
  };
  return list;
}
