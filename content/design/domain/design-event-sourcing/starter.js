export class DomainError extends Error {}
export class ConcurrencyError extends Error {}

// Today: UPDATE gift_cards SET balance = balance - $1 WHERE id = $2.
// Support cannot answer "where did my £40 go?", and two tabs can spend it twice.

export function evolve(state, event) {
  throw new Error('TODO');
}

export function rehydrate(events) {
  throw new Error('TODO');
}

export function decide(state, command) {
  throw new Error('TODO');
}

export function createEventStore() {
  return {
    async load(streamId) {
      throw new Error('TODO');
    },
    async append(streamId, events, expectedVersion) {
      throw new Error('TODO');
    },
  };
}

export function createGiftCardService(store, { maxAttempts = 3 } = {}) {
  return {
    async handle(cardId, command) {
      throw new Error('TODO');
    },
  };
}
