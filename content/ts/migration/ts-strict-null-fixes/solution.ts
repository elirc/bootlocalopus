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

export function createDirectory(users: readonly User[]) {
  const byId = new Map(users.map((u) => [u.id, u]));

  // Decision: "maybe there" lookups say so in their type.
  function find(id: string): User | undefined {
    return byId.get(id);
  }

  // Decision: "must be there" lookups throw a named error instead of returning undefined.
  function get(id: string): User {
    const user = byId.get(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  // Decision: a missing link anywhere in the chain is "no manager name", not a crash.
  function managerName(id: string): string | undefined {
    const managerId = byId.get(id)?.managerId;
    return managerId === undefined ? undefined : byId.get(managerId)?.name;
  }

  function emailDomain(id: string): string | null {
    const email = get(id).email;
    if (email === undefined) return null;
    const at = email.lastIndexOf('@');
    return at === -1 ? null : email.slice(at + 1);
  }

  // Decision: unknown ids are skipped. The predicate tells the compiler what filter removed.
  function displayNames(ids: readonly string[]): string[] {
    return ids.map((id) => byId.get(id)).filter((u): u is User => u !== undefined).map((u) => u.name);
  }

  function isActive(id: string): boolean {
    const user = byId.get(id);
    // `deactivatedAt` may be missing (undefined) or explicitly cleared (null): both mean active.
    return user !== undefined && user.deactivatedAt == null;
  }

  function initials(id: string): string {
    const letters = get(id).name.split(' ').filter((w) => w !== '').map((w) => w[0].toUpperCase()).join('');
    return letters === '' ? '?' : letters;
  }

  return { find, get, managerName, emailDomain, displayNames, isActive, initials };
}
