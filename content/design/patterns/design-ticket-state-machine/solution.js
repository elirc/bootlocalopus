export const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class InvalidTransitionError extends Error {
  constructor(from, event) {
    super(`Cannot ${event} a ticket that is ${from}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.event = event;
  }
}

export function createTicket(id) {
  return { id, status: 'open', assignee: null, resolvedAt: null };
}

// status -> event type -> (ticket, event) => next ticket, or null when a guard says no.
const machine = {
  open: {
    ASSIGN: (t, e) => ({ ...t, status: 'assigned', assignee: e.agent }),
    CLOSE: (t) => ({ ...t, status: 'closed' }),
  },
  assigned: {
    ASSIGN: (t, e) => ({ ...t, assignee: e.agent }),
    ASK_CUSTOMER: (t) => ({ ...t, status: 'waiting' }),
    RESOLVE: (t, e) => ({ ...t, status: 'resolved', resolvedAt: e.at }),
  },
  waiting: {
    CUSTOMER_REPLIED: (t) => ({ ...t, status: 'assigned' }),
    RESOLVE: (t, e) => ({ ...t, status: 'resolved', resolvedAt: e.at }),
  },
  resolved: {
    CUSTOMER_REPLIED: (t, e) =>
      e.at - t.resolvedAt <= REOPEN_WINDOW_MS ? { ...t, status: 'assigned', resolvedAt: null } : null,
    CLOSE: (t) => ({ ...t, status: 'closed' }),
  },
  closed: {},
};

function next(ticket, event) {
  const handlers = machine[ticket.status] ?? {};
  const handler = Object.hasOwn(handlers, event?.type) ? handlers[event.type] : undefined;
  return handler ? handler(ticket, event) : null;
}

export function transition(ticket, event) {
  const result = next(ticket, event);
  if (!result) throw new InvalidTransitionError(ticket.status, event?.type);
  return result;
}

export function can(ticket, event) {
  return next(ticket, event) !== null;
}
