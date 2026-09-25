import net from 'node:net';

const normalize = (address) => {
  const a = String(address ?? '').trim();
  return a.toLowerCase().startsWith('::ffff:') && net.isIPv4(a.slice(7)) ? a.slice(7) : a;
};

export function createClientInfo({ trustedProxies }) {
  const trusted = new net.BlockList();
  for (const entry of trustedProxies) {
    const [network, prefix] = entry.split('/');
    if (prefix === undefined) trusted.addAddress(network);
    else trusted.addSubnet(network, Number(prefix));
  }
  const isTrusted = (ip) => net.isIPv4(ip) && trusted.check(ip);

  return function clientInfo(req) {
    const peer = normalize(req.socket.remoteAddress);
    const peerTrusted = isTrusted(peer);

    let ip = peer;
    const forwarded = req.headers['x-forwarded-for'];
    if (peerTrusted && forwarded) {
      const hops = forwarded.split(',').map(normalize);
      // Right to left: each entry is what a proxy of ours saw, until one is not ours.
      for (let i = hops.length - 1; i >= 0 && isTrusted(ip); i--) {
        if (net.isIP(hops[i]) === 0) break;
        ip = hops[i];
      }
    }

    let protocol = req.socket.encrypted ? 'https' : 'http';
    const proto = req.headers['x-forwarded-proto'];
    if (peerTrusted && proto) {
      const first = proto.split(',')[0].trim().toLowerCase();
      if (first === 'http' || first === 'https') protocol = first;
    }
    return { ip, protocol };
  };
}
