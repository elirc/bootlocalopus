export class DomainError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class ConcurrencyError extends Error {
  constructor(streamId, expectedVersion, actualVersion) {
    super(`Stream ${streamId} is at version ${actualVersion}, expected ${expectedVersion}`);
    this.name = 'ConcurrencyError';
    this.streamId = streamId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

// ---- events are facts: stored forever, so old shapes are upgraded on read ----

function upcast(event) {
  if ((event.type === 'CardRedeemed' || event.type === 'CardRefunded') && event.amountMinor === undefined) {
    const { amount, ...rest } = event;
    return { ...rest, amountMinor: amount };
  }
  return event;
}

/** Pure: (state, event) -> new state. Never mutates `state`. */
export function evolve(state, event) {
  switch (event.type) {
    case 'CardIssued':
      return { cardId: event.cardId, balanceMinor: event.amountMinor, frozen: false, orders: {} };
    case 'CardRedeemed': {
      const order = state.orders[event.orderId] ?? { redeemedMinor: 0, refundedMinor: 0 };
      return {
        ...state,
        balanceMinor: state.balanceMinor - event.amountMinor,
        orders: { ...state.orders, [event.orderId]: { ...order, redeemedMinor: order.redeemedMinor + event.amountMinor } },
      };
    }
    case 'CardRefunded': {
      const order = state.orders[event.orderId];
      return {
        ...state,
        balanceMinor: state.balanceMinor + event.amountMinor,
        orders: { ...state.orders, [event.orderId]: { ...order, refundedMinor: order.refundedMinor + event.amountMinor } },
      };
    }
    case 'CardFrozen':
      return { ...state, frozen: true };
    default:
      return state; // unknown event types from newer code are ignored, not fatal
  }
}

export function rehydrate(events) {
  return events.map(upcast).reduce(evolve, null);
}

const isPositiveAmount = (n) => Number.isSafeInteger(n) && n > 0;

/** Pure: (state, command) -> new events, or a DomainError. Decides; never changes anything. */
export function decide(state, command) {
  if (command.type === 'Issue') {
    if (state !== null) throw new DomainError('ALREADY_ISSUED');
    if (!isPositiveAmount(command.amountMinor)) throw new DomainError('INVALID_AMOUNT');
    return [{ type: 'CardIssued', cardId: command.cardId, amountMinor: command.amountMinor }];
  }
  if (state === null) throw new DomainError('NOT_FOUND');

  switch (command.type) {
    case 'Redeem': {
      if (Object.hasOwn(state.orders, command.orderId)) return []; // a retried request: already done
      if (state.frozen) throw new DomainError('CARD_FROZEN');
      if (!isPositiveAmount(command.amountMinor)) throw new DomainError('INVALID_AMOUNT');
      if (command.amountMinor > state.balanceMinor) throw new DomainError('INSUFFICIENT_FUNDS');
      return [{ type: 'CardRedeemed', orderId: command.orderId, amountMinor: command.amountMinor }];
    }
    case 'Refund': {
      if (!Object.hasOwn(state.orders, command.orderId)) throw new DomainError('UNKNOWN_ORDER');
      if (!isPositiveAmount(command.amountMinor)) throw new DomainError('INVALID_AMOUNT');
      const order = state.orders[command.orderId];
      if (order.refundedMinor + command.amountMinor > order.redeemedMinor) throw new DomainError('REFUND_EXCEEDS_REDEMPTION');
      return [{ type: 'CardRefunded', orderId: command.orderId, amountMinor: command.amountMinor }];
    }
    case 'Freeze':
      return state.frozen ? [] : [{ type: 'CardFrozen', reason: command.reason }];
    default:
      throw new DomainError('UNKNOWN_COMMAND');
  }
}

export function createEventStore() {
  const streams = new Map();
  const tick = () => new Promise((resolve) => setImmediate(resolve)); // behave like real I/O

  return {
    async load(streamId) {
      await tick();
      const events = streams.get(streamId) ?? [];
      return { events: structuredClone(events), version: events.length };
    },
    async append(streamId, events, expectedVersion) {
      await tick();
      const current = streams.get(streamId) ?? [];
      if (current.length !== expectedVersion) throw new ConcurrencyError(streamId, expectedVersion, current.length);
      streams.set(streamId, [...current, ...structuredClone(events)]);
      return current.length + events.length;
    },
  };
}

export function createGiftCardService(store, { maxAttempts = 3 } = {}) {
  return {
    async handle(cardId, command) {
      for (let attempt = 1; ; attempt++) {
        const { events, version } = await store.load(cardId);
        const state = rehydrate(events);
        const newEvents = decide(state, command);
        if (newEvents.length === 0) return { events: [], state };
        try {
          await store.append(cardId, newEvents, version);
        } catch (error) {
          if (error instanceof ConcurrencyError && attempt < maxAttempts) continue; // someone else wrote: decide again
          throw error;
        }
        return { events: newEvents, state: newEvents.reduce(evolve, state) };
      }
    },
  };
}
