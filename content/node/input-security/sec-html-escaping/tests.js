const { html, raw, safeUrl, SafeHtml, renderComment } = solution;
const s = (x) => (x instanceof SafeHtml ? x.value : 'not SafeHtml: ' + String(x));

describe('SafeHtml', () => {
  it('holds and prints its value', () => {
    const h = new SafeHtml('<b>x</b>');
    expect(h.value).toBe('<b>x</b>');
    expect(String(h)).toBe('<b>x</b>');
    expect(`${h}`).toBe('<b>x</b>');
  });
});

describe('html', () => {
  it('returns SafeHtml and escapes all five characters', () => {
    const out = html`<p title="${`"x" & 'y'`}">${'<script>alert(1)</script>'}</p>`;
    expect(out).toBeInstanceOf(SafeHtml);
    expect(out.value).toBe('<p title="&quot;x&quot; &amp; &#39;y&#39;">&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('escapes & first, so entities are not double-decoded', () => {
    expect(s(html`${'&lt;'}`)).toBe('&amp;lt;');
    expect(s(html`${'<&>'}`)).toBe('&lt;&amp;&gt;');
  });

  it('leaves the literal parts alone', () => {
    expect(s(html`<a href="/x?a=1&b=2">ok</a>`)).toBe('<a href="/x?a=1&b=2">ok</a>');
    expect(s(html``)).toBe('');
  });

  it('trusts nested html results without double escaping', () => {
    const inner = html`<b>${'<i>'}</b>`;
    expect(s(html`<p>${inner}</p>`)).toBe('<p><b>&lt;i&gt;</b></p>');
  });

  it('renders arrays recursively', () => {
    const items = ['a<b', 'c'];
    expect(s(html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`)).toBe('<ul><li>a&lt;b</li><li>c</li></ul>');
    expect(s(html`${['<x>', ['<y>', html`<z/>`], 3]}`)).toBe('&lt;x&gt;&lt;y&gt;<z/>3');
    expect(s(html`<ul>${[]}</ul>`)).toBe('<ul></ul>');
  });

  it('renders null, undefined and false as nothing, but keeps 0 and true', () => {
    expect(s(html`[${null}|${undefined}|${false}|${0}|${true}|${''}|${NaN}]`)).toBe('[|||0|true||NaN]');
    const admin = false;
    expect(s(html`<nav>${admin && html`<a href="/admin">Admin</a>`}</nav>`)).toBe('<nav></nav>');
  });

  it('does not trust look-alike objects', () => {
    const forged = { value: '<script>x</script>', toString: () => '<script>x</script>' };
    expect(s(html`${forged}`)).toBe('&lt;script&gt;x&lt;/script&gt;');
    expect(s(html`${{ __html: '<b>' }}`)).toBe('[object Object]');
  });

  it('raw is the explicit opt-out', () => {
    expect(raw('<hr>')).toBeInstanceOf(SafeHtml);
    expect(s(html`<div>${raw('<hr>')}</div>`)).toBe('<div><hr></div>');
    expect(raw(5).value).toBe('5');
  });
});

describe('safeUrl', () => {
  it('allows http, https, mailto and relative URLs unchanged', () => {
    for (const u of ['https://example.com/a?b=1', 'http://example.com', 'mailto:someone@example.com', '/profile/42', 'page.html', '#top', '?q=1', '//cdn.example.com/x.png', 'HTTPS://EXAMPLE.COM']) {
      expect(safeUrl(u)).toBe(u);
    }
  });

  it('blocks script and data schemes however they are disguised', () => {
    for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', '\x01javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd']) {
      expect(safeUrl(u)).toBe('#');
    }
  });

  it('returns # for non-strings and unparseable URLs', () => {
    for (const u of [undefined, null, 42, {}, 'http://[::1']) expect(safeUrl(u)).toBe('#');
  });
});

describe('renderComment', () => {
  it('renders the exact markup', () => {
    expect(s(renderComment({ author: 'Ada', body: 'Nice post', website: 'https://ada.dev' }))).toBe(
      '<article class="comment"><h3><a href="https://ada.dev" rel="nofollow ugc">Ada</a></h3><p>Nice post</p></article>',
    );
  });

  it('escapes every field, including the URL', () => {
    const out = s(renderComment({ author: '<b>Mallory</b>', body: '<img src=x onerror=alert(1)>', website: 'https://x.dev/"onmouseover="alert(1)' }));
    expect(out).toBe(
      '<article class="comment"><h3><a href="https://x.dev/&quot;onmouseover=&quot;alert(1)" rel="nofollow ugc">&lt;b&gt;Mallory&lt;/b&gt;</a></h3><p>&lt;img src=x onerror=alert(1)&gt;</p></article>',
    );
  });

  it('neutralises a javascript: website', () => {
    expect(s(renderComment({ author: 'Eve', body: 'hi', website: 'javascript:alert(document.cookie)' }))).toBe(
      '<article class="comment"><h3><a href="#" rel="nofollow ugc">Eve</a></h3><p>hi</p></article>',
    );
  });

  it('omits the link without a website', () => {
    for (const website of [undefined, null, '']) {
      expect(s(renderComment({ author: 'Bob & Co', body: '1 < 2', website }))).toBe(
        '<article class="comment"><h3>Bob &amp; Co</h3><p>1 &lt; 2</p></article>',
      );
    }
  });
});
