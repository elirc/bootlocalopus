const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const GIF87 = Buffer.from('GIF87a\x01\x00\x01\x00', 'latin1');
const GIF89 = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj', 'latin1');
const HTML = Buffer.from('<html><script>alert(document.cookie)</script></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const inspect = (file, opts) => solution.inspectUpload(file, opts);
const codeOf = (file, opts) => {
  try {
    inspect(file, opts);
  } catch (e) {
    return e instanceof solution.UploadError ? e.code : 'not an UploadError: ' + (e && e.message);
  }
  return 'did not throw';
};

describe('UploadError', () => {
  it('carries its code', () => {
    const e = new solution.UploadError('too-large');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('UploadError');
    expect(e.code).toBe('too-large');
    expect(e.message).toBe('too-large');
  });
});

describe('accepted files', () => {
  it('returns the sniffed type, canonical ext, size and names', () => {
    const out = inspect({ filename: 'Holiday Photo.PNG', declaredType: 'image/png', bytes: PNG });
    expect(out.type).toBe('image/png');
    expect(out.ext).toBe('png');
    expect(out.size).toBe(PNG.length);
    expect(out.displayName).toBe('Holiday Photo.PNG');
    expect(out.storageName).toMatch(/^[0-9a-f]{32}\.png$/);
    expect(inspect({ filename: 'a.png', declaredType: 'image/png', bytes: PNG }).storageName).not.toBe(out.storageName);
  });

  it('recognises every format by its bytes', () => {
    const cases = [
      ['me.jpeg', JPEG, 'image/jpeg', 'jpg'],
      ['me.JPG', JPEG, 'image/jpeg', 'jpg'],
      ['a.gif', GIF87, 'image/gif', 'gif'],
      ['b.gif', GIF89, 'image/gif', 'gif'],
      ['doc.pdf', PDF, 'application/pdf', 'pdf'],
    ];
    for (const [filename, bytes, type, ext] of cases) {
      const out = inspect({ filename, declaredType: type, bytes });
      expect([filename, out.type, out.ext]).toEqual([filename, type, ext]);
      expect(out.storageName.endsWith('.' + ext)).toBe(true);
    }
    const webp = inspect({ filename: 'x.webp', declaredType: 'image/webp', bytes: WEBP }, { allowed: ['image/webp'] });
    expect([webp.type, webp.ext]).toEqual(['image/webp', 'webp']);
  });

  it('accepts a Uint8Array as well as a Buffer', () => {
    expect(inspect({ filename: 'a.png', declaredType: 'image/png', bytes: new Uint8Array(PNG) }).type).toBe('image/png');
  });

  it('treats a missing or generic declared type as unknown', () => {
    for (const declaredType of [undefined, '', 'application/octet-stream', 'Application/Octet-Stream']) {
      expect(inspect({ filename: 'a.png', declaredType, bytes: PNG }).type).toBe('image/png');
    }
  });

  it('normalises the declared type', () => {
    expect(inspect({ filename: 'a.pdf', declaredType: ' Application/PDF ; name=a.pdf', bytes: PDF }).type).toBe('application/pdf');
  });
});

describe('rejections', () => {
  it('empty', () => {
    for (const bytes of [Buffer.alloc(0), new Uint8Array(0), undefined, null, 'not bytes', [0x89, 0x50]]) {
      expect(codeOf({ filename: 'a.png', declaredType: 'image/png', bytes })).toBe('empty');
    }
  });

  it('too-large, before anything else is looked at', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(100)]);
    expect(codeOf({ filename: 'a.png', declaredType: 'image/png', bytes: big }, { maxBytes: big.length })).toBe('did not throw');
    expect(codeOf({ filename: 'a.png', declaredType: 'image/png', bytes: big }, { maxBytes: big.length - 1 })).toBe('too-large');
    expect(codeOf({ filename: 'a.exe', declaredType: 'x/y', bytes: Buffer.alloc(11) }, { maxBytes: 10 })).toBe('too-large');
  });

  it('unsupported-type for content that is not an allowed format, whatever it claims', () => {
    expect(codeOf({ filename: 'invoice.pdf', declaredType: 'application/pdf', bytes: HTML })).toBe('unsupported-type');
    expect(codeOf({ filename: 'logo.svg', declaredType: 'image/svg+xml', bytes: SVG })).toBe('unsupported-type');
    expect(codeOf({ filename: 'logo.png', declaredType: 'image/png', bytes: SVG })).toBe('unsupported-type');
    expect(codeOf({ filename: 'x.webp', declaredType: 'image/webp', bytes: WEBP })).toBe('unsupported-type');
    expect(codeOf({ filename: 'a.pdf', declaredType: 'application/pdf', bytes: PDF }, { allowed: ['image/png'] })).toBe('unsupported-type');
  });

  it('matches magic bytes exactly, not approximately', () => {
    const truncated = PNG.subarray(0, 7);
    expect(codeOf({ filename: 'a.png', declaredType: 'image/png', bytes: truncated })).toBe('unsupported-type');
    const shifted = Buffer.concat([Buffer.from([0]), PNG]);
    expect(codeOf({ filename: 'a.png', declaredType: 'image/png', bytes: shifted })).toBe('unsupported-type');
    expect(codeOf({ filename: 'a.gif', declaredType: 'image/gif', bytes: Buffer.from('GIF88a\x01\x00', 'latin1') })).toBe('unsupported-type');
    const riffNotWebp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt ')]);
    expect(codeOf({ filename: 'a.webp', declaredType: 'image/webp', bytes: riffNotWebp }, { allowed: ['image/webp'] })).toBe('unsupported-type');
    expect(codeOf({ filename: 'a.pdf', declaredType: 'application/pdf', bytes: Buffer.from('%PDF1.7', 'latin1') })).toBe('unsupported-type');
  });

  it('type-mismatch when the declared type disagrees with the bytes', () => {
    expect(codeOf({ filename: 'a.png', declaredType: 'image/jpeg', bytes: PNG })).toBe('type-mismatch');
    expect(codeOf({ filename: 'a.png', declaredType: 'text/html', bytes: PNG })).toBe('type-mismatch');
    expect(codeOf({ filename: 'a.jpg', declaredType: 'image/jpg', bytes: JPEG })).toBe('type-mismatch');
  });

  it('extension-mismatch when the name does not fit the bytes', () => {
    for (const filename of ['photo.png.exe', 'photo.jpg', 'photo', 'photo.', '.png.html', 'photo.PNG ', 'photo.pn g']) {
      expect([filename, codeOf({ filename, declaredType: 'image/png', bytes: PNG })]).toEqual([filename, filename === 'photo.PNG ' ? 'did not throw' : 'extension-mismatch']);
    }
  });

  it('checks the declared type before the extension', () => {
    expect(codeOf({ filename: 'photo.exe', declaredType: 'image/gif', bytes: PNG })).toBe('type-mismatch');
  });
});

describe('names', () => {
  it('uses only the last path segment, without control characters', () => {
    expect(inspect({ filename: '../../etc/cron.d/evil.png', declaredType: 'image/png', bytes: PNG }).displayName).toBe('evil.png');
    expect(inspect({ filename: 'C:\\fakepath\\me.png', declaredType: 'image/png', bytes: PNG }).displayName).toBe('me.png');
    expect(inspect({ filename: 'a\r\nb.png', declaredType: 'image/png', bytes: PNG }).displayName).toBe('ab.png');
  });

  it('stores under a random name even when the user name is dangerous', () => {
    const out = inspect({ filename: 'shell.php.png', declaredType: 'image/png', bytes: PNG });
    expect(out.displayName).toBe('shell.php.png');
    expect(out.storageName).toMatch(/^[0-9a-f]{32}\.png$/);
  });

  it('falls back to "file" for a missing name, which then has no extension', () => {
    expect(codeOf({ filename: undefined, declaredType: 'image/png', bytes: PNG })).toBe('extension-mismatch');
    expect(codeOf({ filename: '/', declaredType: 'image/png', bytes: PNG })).toBe('extension-mismatch');
  });
});
