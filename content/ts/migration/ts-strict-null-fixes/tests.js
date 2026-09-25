const { createDirectory, NotFoundError } = solution;

const USERS = [
  { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', managerId: 'u2' },
  { id: 'u2', name: 'grace hopper', email: 'grace@navy.mil', deactivatedAt: null },
  { id: 'u3', name: 'Linus', managerId: 'u404', deactivatedAt: new Date('2025-06-01') },
  { id: 'u4', name: '', email: 'no-at-sign' },
  { id: 'u5', name: '  mary   ann  ', email: 'm@a@corp.example' },
];

const dir = () => createDirectory(USERS);

function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('expected a throw');
}

describe('find and get', () => {
  it('find returns the user or undefined', () => {
    expect(dir().find('u1').name).toBe('Ada Lovelace');
    expect(dir().find('nope')).toBeUndefined();
  });
  it('get returns the user, or throws NotFoundError instead of returning undefined', () => {
    expect(dir().get('u2').name).toBe('grace hopper');
    const e = thrown(() => dir().get('nope'));
    expect(e).toBeInstanceOf(NotFoundError);
    expect(e.message).toBe('User nope not found');
    expect(e.entity).toBe('User');
    expect(e.id).toBe('nope');
  });
});

describe('managerName', () => {
  it('follows the manager link', () => {
    expect(dir().managerName('u1')).toBe('grace hopper');
  });
  it('is undefined for a missing user, no manager, or a dangling manager id', () => {
    expect(dir().managerName('nope')).toBeUndefined();
    expect(dir().managerName('u2')).toBeUndefined();
    expect(dir().managerName('u3')).toBeUndefined();
  });
});

describe('emailDomain', () => {
  it('returns the part after the last @', () => {
    expect(dir().emailDomain('u1')).toBe('example.com');
    expect(dir().emailDomain('u5')).toBe('corp.example');
  });
  it('is null when there is no email or no @', () => {
    expect(dir().emailDomain('u3')).toBeNull();
    expect(dir().emailDomain('u4')).toBeNull();
  });
  it('throws NotFoundError for an unknown user', () => {
    expect(thrown(() => dir().emailDomain('nope'))).toBeInstanceOf(NotFoundError);
  });
});

describe('displayNames', () => {
  it('skips unknown ids and keeps the order', () => {
    expect(dir().displayNames(['u2', 'nope', 'u1', 'u2'])).toEqual(['grace hopper', 'Ada Lovelace', 'grace hopper']);
    expect(dir().displayNames([])).toEqual([]);
  });
});

describe('isActive', () => {
  it('treats a missing and a null deactivatedAt as active', () => {
    expect(dir().isActive('u1')).toBe(true);
    expect(dir().isActive('u2')).toBe(true);
  });
  it('is false for a deactivated or unknown user', () => {
    expect(dir().isActive('u3')).toBe(false);
    expect(dir().isActive('nope')).toBe(false);
  });
});

describe('initials', () => {
  it('takes the first letter of each word, uppercased', () => {
    expect(dir().initials('u1')).toBe('AL');
    expect(dir().initials('u2')).toBe('GH');
    expect(dir().initials('u3')).toBe('L');
  });
  it('ignores extra spaces', () => {
    expect(dir().initials('u5')).toBe('MA');
  });
  it('is ? for an empty name', () => {
    expect(dir().initials('u4')).toBe('?');
  });
  it('throws NotFoundError for an unknown user', () => {
    expect(thrown(() => dir().initials('nope'))).toBeInstanceOf(NotFoundError);
  });
});
