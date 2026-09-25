"Paste a URL and we will fetch a preview." "Give us a webhook URL." "Import
from a link." Each of these makes **your server** send a request to an
address the user chose — from inside your network. That is server-side request
forgery (SSRF), and it is how the Capital One breach read cloud credentials:
`http://169.254.169.254/latest/meta-data/iam/security-credentials/` is the
cloud metadata service, reachable only from inside, and it hands out keys.

A blocklist of strings does not work, because the host is not what it looks
like:

- `http://2130706433/`, `http://0x7f.1/` and `http://127.1/` are all
  `127.0.0.1` — the WHATWG `URL` parser normalises them, a regex does not.
- `http://[::ffff:127.0.0.1]/` is loopback in IPv6 clothing.
- `http://metadata.internal/` or any attacker-owned domain can simply
  **resolve** to a private address. You must check the addresses the name
  resolves to — **all** of them, since a name can have several.
- Even then, resolving twice (once to check, once to connect) lets a DNS
  server answer differently the second time ("DNS rebinding"). So the check
  returns the address it approved, and the caller connects to **that**.

## Task

Export `class SsrfError extends Error` whose constructor takes a `code` (set
`name = 'SsrfError'`, `this.code`, message = code).

Export `isPublicAddress(ip)`: `false` for anything that is not an IP address
string (`net.isIP`), and `false` for every address in these ranges; `true`
otherwise.

| IPv4 | IPv6 |
| --- | --- |
| `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4` | `::/128`, `::1/128`, `64:ff9b::/96`, `100::/64`, `2001:db8::/32`, `fc00::/7`, `fe80::/10`, `ff00::/8` — and an IPv4-mapped address (`::ffff:a.b.c.d`) is judged by its IPv4 address |

(`net.BlockList` does exactly this kind of check, and treats IPv4-mapped
addresses as their IPv4 form.)

Export `async checkOutboundUrl(input, { lookup, allowedPorts = [80, 443] })`.
`lookup(hostname)` resolves an array of `{ address, family }` (like
`dns.promises.lookup(hostname, { all: true })`). Check, in order, and reject
with an `SsrfError` of the first failing code:

1. `'invalid-url'` — `input` is not a string or `new URL(input)` throws.
2. `'bad-scheme'` — the protocol is not `http:` or `https:`.
3. `'credentials'` — the URL has a username or password.
4. `'bad-port'` — the effective port (`url.port`, or 80/443 by scheme when
   empty) is not in `allowedPorts`.
5. `'dns-failed'` — for a hostname that is not an IP literal: `lookup` rejects
   or resolves an empty array. An IP literal (IPv6 without its `[` `]`) is
   used directly, and `lookup` is **not** called.
6. `'private-address'` — **any** of the addresses is not public.

Otherwise resolve `{ url, address, family }`: the parsed `href`, and the
first address with its family (4 or 6). No request is made here.
