export const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class InvalidTransitionError extends Error {}

export function createTicket(id) {
  return { id, status: 'open', assignee: null, resolvedAt: null };
}

export function transition(ticket, event) {
  // TODO: one table of status -> event type -> next ticket
  throw new Error('TODO');
}

export function can(ticket, event) {
  throw new Error('TODO');
}
