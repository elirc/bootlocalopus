import http from 'node:http';

const fakeReq = (remoteAddress, headers = {}, encrypted = false) => ({
  socket: { remoteAddress, encrypted },
  headers,
});

const info = solution.createClientInfo({ trustedProxies: ['10.0.0.0/8', '192.168.1.10'] });

describe('clientInfo: ip', () => {
  it('uses the socket address when there is no header', () => {
    expect(info(fakeReq('203.0.113.9')).ip).toBe('203.0.113.9');
    expect(info(fakeReq('10.0.0.2')).ip).toBe('10.0.0.2');
  });

  it('ignores X-Forwarded-For from a peer that is not a trusted proxy', () => {
    expect(info(fakeReq('198.51.100.7', { 'x-forwarded-for': '1.2.3.4' })).ip).toBe('198.51.100.7');
  });

  it('takes the address the trusted proxy saw', () => {
    expect(info(fakeReq('10.0.0.2', { 'x-forwarded-for': '203.0.113.9' })).ip).toBe('203.0.113.9');
  });

  it('does not believe entries the client wrote itself', () => {
    const req = fakeReq('10.0.0.2', { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' });
    expect(info(req).ip).toBe('203.0.113.9');
  });

  it('skips a chain of trusted proxies, by subnet and by exact address', () => {
    const req = fakeReq('10.0.0.2', { 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 192.168.1.10, 10.4.5.6' });
    expect(info(req).ip).toBe('203.0.113.9');
    const notQuite = fakeReq('10.0.0.2', { 'x-forwarded-for': '203.0.113.9, 192.168.1.11' });
    expect(info(notQuite).ip).toBe('192.168.1.11');
  });

  it('returns the leftmost entry when every hop is trusted', () => {
    expect(info(fakeReq('10.0.0.2', { 'x-forwarded-for': '10.9.9.9, 10.1.1.1' })).ip).toBe('10.9.9.9');
  });

  it('normalises IPv4-mapped IPv6 addresses and spaces', () => {
    expect(info(fakeReq('::ffff:10.0.0.2', { 'x-forwarded-for': '  ::ffff:203.0.113.9 ' })).ip).toBe('203.0.113.9');
    expect(info(fakeReq('::FFFF:198.51.100.7')).ip).toBe('198.51.100.7');
  });

  it('stops at an entry that is not an IP address', () => {
    const req = fakeReq('10.0.0.2', { 'x-forwarded-for': '203.0.113.9, unknown, 10.0.0.9' });
    expect(info(req).ip).toBe('10.0.0.9');
  });

  it('never trusts an IPv6 client', () => {
    const req = fakeReq('10.0.0.2', { 'x-forwarded-for': '6.6.6.6, 2001:db8::1' });
    expect(info(req).ip).toBe('2001:db8::1');
  });

  it('matches subnets exactly, not by string prefix', () => {
    const narrow = solution.createClientInfo({ trustedProxies: ['172.16.0.0/12'] });
    expect(narrow(fakeReq('172.31.255.254', { 'x-forwarded-for': '203.0.113.9' })).ip).toBe('203.0.113.9');
    expect(narrow(fakeReq('172.32.0.1', { 'x-forwarded-for': '203.0.113.9' })).ip).toBe('172.32.0.1');
    const exact = solution.createClientInfo({ trustedProxies: ['10.0.0.1'] });
    expect(exact(fakeReq('10.0.0.10', { 'x-forwarded-for': '203.0.113.9' })).ip).toBe('10.0.0.10');
  });
});

describe('clientInfo: protocol', () => {
  it('uses the socket when not behind a trusted proxy', () => {
    expect(info(fakeReq('198.51.100.7', { 'x-forwarded-proto': 'https' })).protocol).toBe('http');
    expect(info(fakeReq('198.51.100.7', {}, true)).protocol).toBe('https');
  });

  it('uses the first X-Forwarded-Proto value from a trusted proxy', () => {
    expect(info(fakeReq('10.0.0.2', { 'x-forwarded-proto': 'https' })).protocol).toBe('https');
    expect(info(fakeReq('10.0.0.2', { 'x-forwarded-proto': ' HTTPS , http' })).protocol).toBe('https');
    expect(info(fakeReq('10.0.0.2', { 'x-forwarded-proto': 'http' }, true)).protocol).toBe('http');
  });

  it('ignores a nonsense X-Forwarded-Proto', () => {
    expect(info(fakeReq('10.0.0.2', { 'x-forwarded-proto': 'javascript' })).protocol).toBe('http');
    expect(info(fakeReq('10.0.0.2', { 'x-forwarded-proto': 'gopher' }, true)).protocol).toBe('https');
  });
});

describe('clientInfo on a real server', () => {
  const serve = async (trustedProxies, fn) => {
    const clientInfo = solution.createClientInfo({ trustedProxies });
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(clientInfo(req)));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      return await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  };
  const headers = { 'x-forwarded-for': '6.6.6.6, 203.0.113.9', 'x-forwarded-proto': 'https' };

  it('trusts the headers only when the connection comes from a listed proxy', async () => {
    await serve(['127.0.0.1'], async (base) => {
      expect(await (await fetch(base, { headers })).json()).toEqual({ ip: '203.0.113.9', protocol: 'https' });
    });
    await serve(['10.0.0.0/8'], async (base) => {
      expect(await (await fetch(base, { headers })).json()).toEqual({ ip: '127.0.0.1', protocol: 'http' });
    });
  });
});
