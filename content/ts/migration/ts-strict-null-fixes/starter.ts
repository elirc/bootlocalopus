export interface User {
  id: string;
  name: string;
  email?: string;
  managerId?: string;
  deactivatedAt?: Date | null;
}

export class NotFoundError extends Error {
  constructor(readonly entity: string, readonly id: string) {
    super(`${entity} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

// This compiled before `strictNullChecks` was turned on. Now every function below
// has at least one error, and each one is a real bug. Fix the behaviour, not just
// the error: see the brief for the decision each function needs.
export function createDirectory(users: readonly User[]) {
  const byId = new Map(users.map((u) => [u.id, u]));

  function find(id: string): User {
    return byId.get(id);
  }

  function get(id: string): User {
    return byId.get(id);
  }

  function managerName(id: string): string {
    return byId.get(byId.get(id).managerId).name;
  }

  function emailDomain(id: string): string {
    return get(id).email.split('@')[1];
  }

  function displayNames(ids: readonly string[]): string[] {
    return ids.map((id) => byId.get(id).name);
  }

  function isActive(id: string): boolean {
    return !byId.get(id).deactivatedAt;
  }

  function initials(id: string): string {
    return get(id).name.split(' ').map((w) => w[0].toUpperCase()).join('');
  }

  return { find, get, managerName, emailDomain, displayNames, isActive, initials };
}
