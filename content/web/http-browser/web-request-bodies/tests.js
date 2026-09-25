const { createRequest } = solution;
const URL_ = 'https://api.example.com/items';

describe('json', () => {
  it('stringifies the body, sets the type and defaults to POST', async () => {
    const req = createRequest(URL_, { json: { name: 'Mug', tags: ['a'] } });
    expect(req).toBeInstanceOf(Request);
    expect(req.method).toBe('POST');
    expect(req.url).toBe(URL_);
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(await req.text()).toBe('{"name":"Mug","tags":["a"]}');
  });

  it('sends falsy JSON values instead of dropping them', async () => {
    for (const [value, text] of [[false, 'false'], [0, '0'], [null, 'null'], ['', '""']]) {
      const req = createRequest(URL_, { method: 'PUT', json: value });
      expect(req.headers.get('content-type')).toBe('application/json');
      expect(await req.text()).toBe(text);
    }
  });

  it('keeps a content type the caller chose', async () => {
    const req = createRequest(URL_, {
      method: 'patch',
      headers: { 'Content-Type': 'application/merge-patch+json', 'X-Request-Id': 'r1' },
      json: { price: 900 },
    });
    expect(req.headers.get('content-type')).toBe('application/merge-patch+json');
    expect(req.headers.get('x-request-id')).toBe('r1');
  });
});

describe('methods', () => {
  it('upper-cases every method, including the ones fetch leaves alone', () => {
    expect(createRequest(URL_, { method: 'patch', json: {} }).method).toBe('PATCH');
    expect(createRequest(URL_, { method: 'delete' }).method).toBe('DELETE');
    expect(createRequest(URL_, { method: 'purge' }).method).toBe('PURGE');
  });

  it('defaults to GET without a body, with no body and no content type', async () => {
    const req = createRequest(URL_, { headers: [['accept', 'application/json']] });
    expect(req.method).toBe('GET');
    expect(req.body).toBe(null);
    expect(req.headers.get('content-type')).toBe(null);
    expect(req.headers.get('accept')).toBe('application/json');
    expect(createRequest(URL_).method).toBe('GET');
  });

  it('refuses a body on GET or HEAD', () => {
    expect(() => createRequest(URL_, { method: 'GET', json: {} })).toThrow(TypeError);
    expect(() => createRequest(URL_, { method: 'head', form: { a: 1 } })).toThrow(TypeError);
  });

  it('refuses two body options, even when one of them is falsy', () => {
    expect(() => createRequest(URL_, { json: {}, form: {} })).toThrow(TypeError);
    expect(() => createRequest(URL_, { json: null, multipart: { a: 1 } })).toThrow(TypeError);
  });
});

describe('form', () => {
  it('url-encodes, repeats arrays, skips null and undefined', async () => {
    const req = createRequest(URL_, {
      form: { q: 'blue mug & saucer', size: ['s', 'm'], page: 2, gift: false, note: null, ref: undefined },
    });
    expect(req.method).toBe('POST');
    expect(req.headers.get('content-type')).toMatch(/^application\/x-www-form-urlencoded/);
    const params = new URLSearchParams(await req.text());
    expect([...params]).toEqual([['q', 'blue mug & saucer'], ['size', 's'], ['size', 'm'], ['page', '2'], ['gift', 'false']]);
  });
});

describe('multipart', () => {
  it('lets the runtime set the boundary', async () => {
    const req = createRequest(URL_, { multipart: { title: 'Invoice' } });
    expect(req.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    const form = await req.formData();
    expect(form.get('title')).toBe('Invoice');
  });

  it('drops a hand-written multipart content type', async () => {
    const req = createRequest(URL_, {
      headers: { 'content-type': 'multipart/form-data', authorization: 'Bearer t' },
      multipart: { title: 'Invoice' },
    });
    expect(req.headers.get('content-type')).toMatch(/boundary=/);
    expect(req.headers.get('authorization')).toBe('Bearer t');
    expect((await req.formData()).get('title')).toBe('Invoice');
  });

  it('appends files with their names, arrays in order, and stringifies the rest', async () => {
    const file = new File(['%PDF-1.7'], 'invoice.pdf', { type: 'application/pdf' });
    const req = createRequest(URL_, {
      method: 'put',
      multipart: { doc: file, tags: ['tax', '2026'], amount: 1250, draft: true, missing: null },
    });
    expect(req.method).toBe('PUT');
    const form = await req.formData();
    const doc = form.get('doc');
    expect(doc).toBeInstanceOf(Blob);
    expect(doc.name).toBe('invoice.pdf');
    expect(await doc.text()).toBe('%PDF-1.7');
    expect(form.getAll('tags')).toEqual(['tax', '2026']);
    expect(form.get('amount')).toBe('1250');
    expect(form.get('draft')).toBe('true');
    expect(form.has('missing')).toBe(false);
  });

  it('appends a plain Blob as a file, not as "[object Blob]"', async () => {
    const req = createRequest(URL_, { multipart: { avatar: new Blob(['png-bytes'], { type: 'image/png' }) } });
    const avatar = (await req.formData()).get('avatar');
    expect(avatar).toBeInstanceOf(Blob);
    expect(await avatar.text()).toBe('png-bytes');
  });
});
