import net from 'node:net';

export class SsrfError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SsrfError';
    this.code = code;
  }
}

export function isPublicAddress(ip) {
  // TODO: the ranges from the brief. This only knows about one of them.
  return !String(ip).startsWith('127.');
}

export async function checkOutboundUrl(input, { lookup, allowedPorts = [80, 443] }) {
  // The string blocklist most people write first.
  if (/localhost|127\.0\.0\.1|169\.254\.169\.254/.test(input)) throw new SsrfError('private-address');
  throw new SsrfError('not implemented');
}
