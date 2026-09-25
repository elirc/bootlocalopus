The new checkout goes to 10 % of users. Support gets a ticket: "the page
keeps changing every time I refresh". The flag service picked the 10 % with
`Math.random() < 0.1` on every request. A week later, the same team ramps a
pricing experiment to 50 % and finds its results are useless: it hashed only
the user id, so the same half of users was in **every** experiment at once,
and the two experiments measured each other.

A percentage rollout has to be **sticky** (the same user gets the same
answer on every request and every server), **independent per flag** (being
in one rollout says nothing about another), and **monotonic** (ramping from
10 % to 20 % adds users; nobody who had the feature loses it). All three come
from one idea: hash the flag key together with the user id into a fixed
bucket, and compare the bucket with the percentage.

## Your task

Implement `evaluateFlag(flag, user)`. The starter exports `fnv1a32(text)`, a
32-bit hash that returns an unsigned integer. Use it as it is.

A flag looks like this:

```js
{
  key: 'new-checkout',
  enabled: true,                 // the kill switch
  allow: ['u_staff_1'],          // optional: always on for these user ids
  deny: ['u_bot_9'],             // optional: always off for these user ids
  rules: [{ attribute: 'country', in: ['GB', 'IE'] }], // optional
  rolloutPercent: 25,            // 0 to 100, two decimals allowed (0.5 means 0.5 %)
}
```

and a user like `{ id: 'u_42', country: 'GB', plan: 'pro' }`. The user can
be anonymous: `id` missing or `null`.

`evaluateFlag` returns `{ enabled, reason }`, checking **in this order** and
stopping at the first that applies:

| Condition | Result |
| --- | --- |
| `flag.enabled` is `false` | `{ enabled: false, reason: 'killed' }` |
| the user's id is in `deny` | `{ enabled: false, reason: 'denied' }` |
| the user's id is in `allow` | `{ enabled: true, reason: 'allowed' }` |
| any rule does not match (a rule matches when `user[rule.attribute]` is in `rule.in`; a missing attribute does not match) | `{ enabled: false, reason: 'not-targeted' }` |
| `rolloutPercent` is `100` | `{ enabled: true, reason: 'rollout' }` |
| the user is anonymous | `{ enabled: false, reason: 'anonymous' }` |
| otherwise | `enabled` is `bucket < Math.round(rolloutPercent * 100)`, `reason: 'rollout'` |

where `bucket = fnv1a32(`${flag.key}:${user.id}`) % 10000` (a number from 0
to 9999, so each bucket is 0.01 %). Missing `allow`, `deny` or `rules` mean
empty. `deny` wins over `allow`: a user on both lists is denied.

Before anything else, if `rolloutPercent` is not a number from 0 to 100
inclusive, throw a `RangeError`. A misconfigured flag should fail loudly in
the config review, not silently turn off for everyone.

## The traps

- **Hash the flag key and the user id together.** `fnv1a32(user.id)` alone
  passes every single-flag test and puts the same users in every rollout.
- **Use 10,000 buckets**, not `% 100`. With 100 buckets a 0.5 % canary is
  0 % or 1 %. (The `Math.round` only stops `0.07 * 100` being
  `7.000000000000001`.)
- **Anonymous users** have no stable id to hash. Hashing `"undefined"` puts
  every anonymous visitor in the same bucket: all of them in, or all out.
