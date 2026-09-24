import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'node-security',
  title: 'Security you cannot skip',
  summary: 'Per-object authorization, password storage, cookie sessions with CSRF protection, and secrets that never reach a log.',
  lessons: [
    {
      id: 'sec-authz-idor',
      title: 'Object-level authorization',
      kind: 'node',
      xp: 95,
      why: 'Being logged in is not permission. Checking ownership on every object is the most common security bug in real APIs, and the easiest to prevent.',
      tags: ['security', 'authorization', 'idor', 'layering'],
      hints: [
        'Write one private helper in the service, `loadFor(actor, id)`, that fetches the note and throws `NotFoundError` if it is missing **or** not accessible. Make `get`, `update` and `remove` all go through it.',
        'Accessible means `actor.role === \'admin\' || note.ownerId === actor.id`. Compare the role exactly: `\'Admin\'` and a missing role are ordinary users.',
        'Mass assignment: never spread the client\'s object into a stored record. Copy the editable fields explicitly — `{ title: input.title, body: input.body }` — and set `ownerId` from the actor, last and unconditionally.',
        'For `list`, call `notes.findByOwner(actor.id)` for users and `notes.all()` for admins. Filtering in the handler would work today and leak tomorrow.',
        'In the handler: `if (!actor) return send(res, 401, { error: \'unauthorized\' })` first, and in the catch `if (error instanceof NotFoundError) return send(res, 404, { error: \'not found\' })`.',
      ],
    },
    {
      id: 'sec-password-hashing',
      title: 'Storing passwords with scrypt',
      kind: 'node',
      xp: 100,
      why: 'Every product has a users table. Getting password storage wrong is the breach that makes the news; getting it right is thirty lines.',
      tags: ['security', 'crypto', 'passwords', 'defensive coding'],
      hints: [
        '`const scrypt = promisify(crypto.scrypt)` is already in the starter. `await scrypt(password, saltBuffer, 32, { N, r, p })` resolves a 32-byte Buffer.',
        'Build the string with `[\'scrypt\', N, r, p, salt.toString(\'base64url\'), key.toString(\'base64url\')].join(\'$\')` and take it apart with `split(\'$\')` — insist on exactly six fields.',
        'Validate each number with a strict regex like `/^[1-9]\\d*$/` before `Number()`. `Number(\'1e3\')` is 1000 and `parseInt(\'1024abc\')` is 1024; neither is a parameter you wrote.',
        '`Buffer.from(text, \'base64url\')` never throws — it silently skips junk. So the real check is the decoded length: at least 16 for the salt, exactly 32 for the key. That also guarantees `timingSafeEqual` gets equal-length buffers.',
        'Wrap the `await scrypt(...)` in try/catch and return `false` from the catch: a non-power-of-two `N` or one past the memory limit rejects rather than returning. `needsRehash` reuses the same parser and returns `true` when it gives up.',
      ],
    },
    {
      id: 'sec-cookies-csrf',
      title: 'Session cookies, SameSite and CSRF',
      kind: 'node',
      xp: 105,
      why: 'Cookie sessions are the default for web apps, and every one of their attributes exists because of a real attack. You will be asked to explain them.',
      tags: ['security', 'cookies', 'csrf', 'sessions', 'http'],
      hints: [
        'Parse the request\'s cookies by splitting `req.headers.cookie ?? \'\'` on `;`, then each part on its **first** `=` only (`part.indexOf(\'=\')`): cookie values may contain `=`.',
        'Send two cookies with `res.writeHead(200, { \'set-cookie\': [sidLine, csrfLine] })`. A single string with a comma between them is a different, broken header.',
        'Keep sessions in a `Map` of `sid -> { username, csrfToken, createdAt }`. Mint both values with `crypto.randomBytes(18).toString(\'base64url\')` — never derive them from the username or a counter.',
        'The Origin rule is `req.headers.origin !== undefined && req.headers.origin !== allowedOrigin` → 403. Compare the whole string: `startsWith` or `includes` lets `https://app.example.evil.com` through.',
        'For the token: the header must equal the `csrf` cookie **and** `session.csrfToken`. Checking only header === cookie is classic double-submit, and it falls to an attacker who can plant a cookie; binding it to the session closes that.',
        'Logout: `sessions.delete(sid)` first, then send 204 with `sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` and the matching `csrf=` line. Deleting only the cookie leaves a stolen copy working.',
      ],
    },
    {
      id: 'sec-config-secrets',
      title: 'Config from env, validated at boot',
      kind: 'node',
      xp: 85,
      why: 'A service should refuse to start with a broken config, say everything that is wrong in one go, and be unable to log its own database password.',
      tags: ['security', 'configuration', 'validation', 'operations'],
      hints: [
        'Describe the variables as data: an array of `{ name, key, default, required, parse }`. One loop then handles missing, empty, default and required uniformly.',
        'Push each problem into an array and `continue` — never `throw` inside the loop. Throw once, after it, if the array is non-empty.',
        'For `PORT`, test the raw string with `/^\\d+$/` before converting, then check the range. `Number(\'1e3\')`, `Number(\'0x50\')` and `parseInt(\'3000abc\')` all produce numbers you did not mean to accept.',
        'In `Secret`, store the value in `#value`. `util.inspect` never shows private fields, and neither does `Object.values`. Then add `toJSON()`, `toString()` and `[inspect.custom]()` (with `import { inspect } from \'node:util\'`) each returning `\'[REDACTED]\'`.',
        'Write the DATABASE_URL and SESSION_SECRET problem strings as fixed text — `\'DATABASE_URL must be a postgres:// or postgresql:// URL\'` — with no `${raw}` in them. Finish with `return Object.freeze(config)`.',
      ],
    },
  ],
});
