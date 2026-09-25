const DNS = {
  'example.com': [{ address: '93.184.216.34', family: 4 }],
  'dual.example.com': [{ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }, { address: '93.184.216.34', family: 4 }],
  'localhost': [{ address: '127.0.0.1', family: 4 }],
  'metadata.internal': [{ address: '169.254.169.254', family: 4 }],
  'sneaky.example.com': [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }],
  'v6-local.example.com': [{ address: '::1', family: 6 }],
  'mapped.example.com': [{ address: '::ffff:192.168.1.1', family: 6 }],
  'empty.example.com': [],
};

const makeLookup = () => {
  const calls = [];
  const lookup = async (host) => {
    calls.push(host);
    await null;
    if (!Object.hasOwn(DNS, host)) {
      const e = new Error('getaddrinfo ENOTFOUND ' + host);
      e.code = 'ENOTFOUND';
      throw e;
    }
    return DNS[host].map((a) => ({ ...a }));
  };
  return { lookup, calls };
};

const codeOf = async (input, extra = {}) => {
  const { lookup } = makeLookup();
  try {
    await solution.checkOutboundUrl(input, { lookup, ...extra });
    return 'resolved';
  } catch (e) {
    return e instanceof solution.SsrfError ? e.code : 'not an SsrfError: ' + (e && e.message);
  }
};

describe('isPublicAddress', () => {
  it('accepts ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '1.1.1.1', '172.15.255.255', '172.32.0.0', '192.169.0.1', '100.63.255.255', '100.128.0.0', '223.255.255.255', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
      expect([ip, solution.isPublicAddress(ip)]).toEqual([ip, true]);
    }
  });

  it('rejects every private, local and reserved IPv4 range', () => {
    for (const ip of ['0.0.0.0', '0.1.2.3', '10.0.0.1', '10.255.255.255', '100.64.0.1', '100.127.255.255', '127.0.0.1', '127.255.255.254', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9', '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255']) {
      expect([ip, solution.isPublicAddress(ip)]).toEqual([ip, false]);
    }
  });

  it('rejects the IPv6 ranges, and judges IPv4-mapped addresses by their IPv4 part', () => {
    for (const ip of ['::', '::1', '0:0:0:0:0:0:0:1', 'fe80::1', 'febf::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '64:ff9b::7f00:1', '100::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '::ffff:10.0.0.1']) {
      expect([ip, solution.isPublicAddress(ip)]).toEqual([ip, false]);
    }
  });

  it('rejects things that are not IP addresses', () => {
    for (const v of ['', 'localhost', '127.1', '256.0.0.1', '1.2.3', 'example.com', undefined, null, 2130706433, ['8.8.8.8']]) {
      expect(solution.isPublicAddress(v)).toBe(false);
    }
  });
});

describe('checkOutboundUrl', () => {
  it('resolves a public URL with the address to connect to', async () => {
    const { lookup, calls } = makeLookup();
    const out = await solution.checkOutboundUrl('https://Example.com/a?b=1', { lookup });
    expect(out).toEqual({ url: 'https://example.com/a?b=1', address: '93.184.216.34', family: 4 });
    expect(calls).toEqual(['example.com']);
  });

  it('returns the first address when there are several, all public', async () => {
    const { lookup } = makeLookup();
    const out = await solution.checkOutboundUrl('http://dual.example.com/', { lookup });
    expect(out).toEqual({ url: 'http://dual.example.com/', address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 });
  });

  it('rejects bad input and schemes', async () => {
    for (const input of [undefined, 42, '', 'not a url', '/relative/path', 'example.com']) expect(await codeOf(input)).toBe('invalid-url');
    for (const input of ['ftp://example.com/', 'file:///etc/passwd', 'gopher://example.com/', 'javascript:alert(1)', 'data:text/plain,hi', 'ws://example.com/']) {
      expect(await codeOf(input)).toBe('bad-scheme');
    }
  });

  it('rejects embedded credentials', async () => {
    expect(await codeOf('https://user:pass@example.com/')).toBe('credentials');
    expect(await codeOf('https://user@example.com/')).toBe('credentials');
    expect(await codeOf('https://example.com@127.0.0.1/')).toBe('credentials');
  });

  it('allows only the listed ports, defaulting by scheme', async () => {
    expect(await codeOf('http://example.com/')).toBe('resolved');
    expect(await codeOf('https://example.com:443/')).toBe('resolved');
    expect(await codeOf('http://example.com:443/')).toBe('resolved');
    for (const input of ['http://example.com:8080/', 'https://example.com:22/', 'http://example.com:6379/']) {
      expect(await codeOf(input)).toBe('bad-port');
    }
    expect(await codeOf('https://example.com/', { allowedPorts: [8443] })).toBe('bad-port');
    expect(await codeOf('https://example.com:8443/', { allowedPorts: [8443] })).toBe('resolved');
  });

  it('checks IP literals directly, however they are spelled, without DNS', async () => {
    const { lookup, calls } = makeLookup();
    for (const input of ['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://127.1/', 'http://0177.0.0.1/', 'http://0/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fe80::1]/', 'http://10.1.2.3/']) {
      let code = 'resolved';
      try {
        await solution.checkOutboundUrl(input, { lookup });
      } catch (e) {
        code = e.code;
      }
      expect([input, code]).toEqual([input, 'private-address']);
    }
    expect(calls).toEqual([]);
    const out = await solution.checkOutboundUrl('http://[2606:4700:4700::1111]/', { lookup });
    expect(out).toEqual({ url: 'http://[2606:4700:4700::1111]/', address: '2606:4700:4700::1111', family: 6 });
    expect((await solution.checkOutboundUrl('http://8.8.8.8/', { lookup })).family).toBe(4);
  });

  it('checks what a name resolves to, and every answer', async () => {
    for (const input of ['http://localhost/', 'http://LOCALHOST/', 'http://metadata.internal/', 'http://sneaky.example.com/', 'http://v6-local.example.com/', 'http://mapped.example.com/']) {
      expect([input, await codeOf(input)]).toEqual([input, 'private-address']);
    }
  });

  it('treats a failed or empty lookup as dns-failed', async () => {
    expect(await codeOf('http://no-such-host.example/')).toBe('dns-failed');
    expect(await codeOf('http://empty.example.com/')).toBe('dns-failed');
  });

  it('does not resolve names for URLs it already rejected', async () => {
    const { lookup, calls } = makeLookup();
    for (const input of ['ftp://example.com/', 'http://u:p@example.com/', 'http://example.com:25/']) {
      await solution.checkOutboundUrl(input, { lookup }).catch(() => {});
    }
    expect(calls).toEqual([]);
  });
});
