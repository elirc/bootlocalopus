const { sameText, slugify, canonicalUsername } = solution;

const NFC_CAFE = 'café';
const NFD_CAFE = 'café';

describe('sameText', () => {
  it('treats composed and decomposed forms as equal', () => {
    expect(NFC_CAFE === NFD_CAFE).toBe(false);
    expect(sameText(NFC_CAFE, NFD_CAFE)).toBe(true);
    expect(sameText(NFD_CAFE, NFC_CAFE)).toBe(true);
  });

  it('folds canonical singletons like the Angstrom sign', () => {
    expect(sameText('Å', 'Å')).toBe(true);
    expect(sameText('Å', 'Å')).toBe(true);
  });

  it('does not fold case or compatibility characters', () => {
    expect(sameText('Café', 'café')).toBe(false);
    expect(sameText('ｃａｆｅ', 'cafe')).toBe(false);
    expect(sameText('cafe', 'café')).toBe(false);
  });
});

describe('slugify', () => {
  it('removes accents instead of dropping the letter', () => {
    expect(slugify('Crème Brûlée!')).toBe('creme-brulee');
    expect(slugify('Ångström & Co.')).toBe('angstrom-co');
  });

  it('handles decomposed input the same as composed', () => {
    expect(slugify('été')).toBe('ete');
    expect(slugify('été')).toBe('ete');
  });

  it('folds compatibility characters', () => {
    expect(slugify('Ｆｕｌｌｗｉｄｔｈ Title')).toBe('fullwidth-title');
    expect(slugify('ﬁle №5')).toBe('file-no5');
    expect(slugify('x² + y²')).toBe('x2-y2');
  });

  it('collapses separators and trims dashes', () => {
    expect(slugify('  --Hello,   World--  ')).toBe('hello-world');
    expect(slugify('a_b.c/d')).toBe('a-b-c-d');
    expect(slugify('2025: Year in review')).toBe('2025-year-in-review');
  });

  it('returns "untitled" when nothing is left', () => {
    expect(slugify('日本語')).toBe('untitled');
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify('')).toBe('untitled');
  });
});

describe('canonicalUsername', () => {
  it('lowercases and trims', () => {
    expect(canonicalUsername('Admin')).toBe('admin');
    expect(canonicalUsername('  bob_smith ')).toBe('bob_smith');
    expect(canonicalUsername('j.doe-99')).toBe('j.doe-99');
  });

  it('folds fullwidth and other compatibility forms onto ASCII', () => {
    expect(canonicalUsername('ＡＤＭＩＮ')).toBe('admin');
    expect(canonicalUsername('Kelvin')).toBe('kelvin'); // Kelvin sign
    expect(canonicalUsername('ﬀ_x')).toBe('ff_x');
  });

  it('rejects look-alikes from other scripts', () => {
    expect(canonicalUsername('аdmin')).toBeNull(); // Cyrillic а
    expect(canonicalUsername('pаypal')).toBeNull();
  });

  it('rejects invisible characters and accents', () => {
    expect(canonicalUsername('admin​')).toBeNull();
    expect(canonicalUsername('ad­min')).toBeNull(); // soft hyphen
    expect(canonicalUsername('ève')).toBeNull();
    expect(canonicalUsername('éve')).toBeNull();
  });

  it('enforces the length and alphabet', () => {
    expect(canonicalUsername('ab')).toBeNull();
    expect(canonicalUsername('a'.repeat(20))).toBe('a'.repeat(20));
    expect(canonicalUsername('a'.repeat(21))).toBeNull();
    expect(canonicalUsername('bob smith')).toBeNull();
    expect(canonicalUsername('bob@home')).toBeNull();
  });
});
