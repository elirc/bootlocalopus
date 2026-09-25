import net from 'node:net';

export function createClientInfo({ trustedProxies }) {
  return function clientInfo(req) {
    // TODO: walk X-Forwarded-For from the right while the address is a trusted proxy.
    return { ip: req.socket.remoteAddress, protocol: 'http' };
  };
}
