Behind a load balancer, `req.socket.remoteAddress` is the load balancer.
Every request "comes from" `10.0.3.17`, so the per-IP rate limiter blocks
everyone at once, and the audit log is useless. The fix everyone reaches for
is worse:

```js
const ip = req.headers['x-forwarded-for'].split(',')[0]; // the client's own claim
```

`X-Forwarded-For` is a list that **each proxy appends to**: it adds the
address the request came *from*. So the left end is whatever the client
wrote — `curl -H 'X-Forwarded-For: 1.2.3.4'` makes anyone anyone. Only the
entries added by **your** proxies can be trusted, and those are at the
**right** end.

The algorithm (what Express's `trust proxy` does):

1. Start with the socket's address. If it is **not** one of your proxies,
   that is the client — ignore the headers entirely (someone connected
   directly and may be lying).
2. Otherwise, walk `X-Forwarded-For` from **right to left**. Each entry is the
   address your proxy saw. If that address is itself a trusted proxy, keep
   going left; the first one that is not trusted is the client.
3. If every entry is trusted, the leftmost one is the client.

```
socket 10.0.0.2 (LB)   X-Forwarded-For: 6.6.6.6, 203.0.113.9, 10.0.0.7
                                        ^ spoofed   ^ client     ^ internal proxy
```

## Task

Export `createClientInfo({ trustedProxies })`, where `trustedProxies` is an
array of IPv4 addresses and CIDR ranges (`'10.0.0.0/8'`, `'192.168.1.10'`).
It returns `clientInfo(req)`, which reads `req.socket.remoteAddress`,
`req.socket.encrypted` and `req.headers`, and returns `{ ip, protocol }`:

- **Normalise** addresses before comparing or returning them: trim spaces and
  turn an IPv4-mapped IPv6 address (`::ffff:10.0.0.2`) into plain IPv4.
- **`ip`**: the algorithm above. If an `X-Forwarded-For` entry is not a valid
  IP address (`net.isIP(x) === 0`, e.g. `unknown`), stop there and return the
  last address reached. No header → the socket address.
- **`protocol`**: if the socket peer is trusted and `X-Forwarded-Proto` is
  present, its **first** comma-separated value, trimmed and lower-cased — but
  only if that is `http` or `https`. Otherwise `'https'` when
  `req.socket.encrypted` is true, else `'http'`.

`BlockList` from `node:net` matches addresses and subnets for you:
`list.addAddress(ip)`, `list.addSubnet(network, prefix)`, `list.check(ip)`.
IPv6 proxies are out of scope; an IPv6 client address is simply never
trusted.
