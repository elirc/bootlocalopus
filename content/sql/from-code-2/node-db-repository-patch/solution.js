// The one place that knows both vocabularies: SQL column names on one side,
// the application's camelCase properties on the other.
const toUser = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  bio: row.bio,
  creditCents: row.credit_cents,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// What a PATCH may change, and the column each property maps to. Column
// names in SQL text only ever come from here, never from the request.
const PATCHABLE = {
  email: { column: 'email', nullable: false },
  displayName: { column: 'display_name', nullable: false },
  bio: { column: 'bio', nullable: true },
};

const COLUMNS = 'id, email, display_name, bio, credit_cents, created_at, updated_at';

function checkId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new RangeError('id must be a positive integer');
}

function checkPatch(patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) throw new RangeError('patch must be an object');
  const sets = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(PATCHABLE, key)) throw new RangeError(`${key} cannot be changed`);
    if (value === undefined) continue; // absent: leave the column alone
    const { column, nullable } = PATCHABLE[key];
    if (value === null && !nullable) throw new RangeError(`${key} cannot be null`);
    if (value !== null && typeof value !== 'string') throw new RangeError(`${key} must be a string`);
    sets.push([column, value]);
  }
  return sets;
}

export function createUserRepository(conn) {
  return {
    async findById(id) {
      checkId(id);
      const { rows } = await conn.query(`select ${COLUMNS} from users where id = $1`, [id]);
      return rows.length ? toUser(rows[0]) : null;
    },

    async create({ email, displayName, bio = null } = {}) {
      if (typeof email !== 'string' || typeof displayName !== 'string') {
        throw new RangeError('email and displayName are required strings');
      }
      if (bio !== null && typeof bio !== 'string') throw new RangeError('bio must be a string or null');
      const { rows } = await conn.query(
        `insert into users (email, display_name, bio) values ($1, $2, $3) returning ${COLUMNS}`,
        [email, displayName, bio],
      );
      return toUser(rows[0]);
    },

    async update(id, patch) {
      checkId(id);
      const sets = checkPatch(patch);
      if (sets.length === 0) return this.findById(id); // nothing to write

      // $1..$n for the values, in the same order as the SET list; the id last.
      const assignments = sets.map(([column], i) => `${column} = $${i + 1}`);
      const params = sets.map(([, value]) => value);
      params.push(id);
      const { rows } = await conn.query(
        `update users set ${assignments.join(', ')}, updated_at = now()
          where id = $${params.length}
          returning ${COLUMNS}`,
        params,
      );
      return rows.length ? toUser(rows[0]) : null;
    },

    async remove(id) {
      checkId(id);
      const { rows } = await conn.query('delete from users where id = $1 returning id', [id]);
      return rows.length === 1;
    },
  };
}
