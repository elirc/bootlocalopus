import net from 'node:net';

export class SsrfError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SsrfError';
    this.code = code;
  }
}

const blocked = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blocked.addSubnet(network, prefix, 'ipv6');
// BlockList checks an IPv4-mapped IPv6 address (::ffff:127.0.0.1) against the IPv4 rules.

export function isPublicAddress(ip) {
  const version = typeof ip === 'string' ? net.isIP(ip) : 0;
  if (version === 0) return false;
  try {
    return !blocked.check(ip, version === 4 ? 'ipv4' : 'ipv6');
  } catch {
    return false; // anything BlockList cannot parse is not something we will connect to
  }
}

const DEFAULT_PORTS = { 'http:': 80, 'https:': 443 };

export async function checkOutboundUrl(input, { lookup, allowedPorts = [80, 443] }) {
  let url;
  try {
    if (typeof input !== 'string') throw new Error('not a string');
    url = new URL(input);
  } catch {
    throw new SsrfError('invalid-url');
  }
  if (!Object.hasOwn(DEFAULT_PORTS, url.protocol)) throw new SsrfError('bad-scheme');
  if (url.username !== '' || url.password !== '') throw new SsrfError('credentials');
  const port = url.port === '' ? DEFAULT_PORTS[url.protocol] : Number(url.port);
  if (!allowedPorts.includes(port)) throw new SsrfError('bad-port');

  // url.hostname is already normalised: "0x7f.1" is "127.0.0.1", IPv6 keeps its brackets.
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  let addresses;
  if (net.isIP(host)) {
    addresses = [{ address: host, family: net.isIP(host) }];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new SsrfError('dns-failed');
    }
    if (!Array.isArray(addresses) || addresses.length === 0) throw new SsrfError('dns-failed');
  }

  // Every answer must be public: the client may connect to any of them.
  if (!addresses.every((a) => isPublicAddress(a.address))) throw new SsrfError('private-address');

  // Connect to this exact address; resolving again would reopen DNS rebinding.
  const [first] = addresses;
  return { url: url.href, address: first.address, family: first.family };
}
