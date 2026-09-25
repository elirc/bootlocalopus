const { graphemeLength, truncate, truncateBytes, countWords } = solution;

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'; // 👨‍👩‍👧‍👦, 11 code units, 25 bytes
const FLAG = '\u{1F1EF}\u{1F1F5}'; // 🇯🇵
const THUMB = '\u{1F44D}\u{1F3FD}'; // 👍🏽
const E_ACUTE = 'é'; // decomposed é
const KEYCAP = '1️⃣'; // 1️⃣

const utf8 = (s) => new TextEncoder().encode(s).length;
const isWellFormed = (s) => s.isWellFormed();

describe('graphemeLength', () => {
  it('counts what a person would count', () => {
    expect(graphemeLength('hello')).toBe(5);
    expect(graphemeLength(FAMILY)).toBe(1);
    expect(graphemeLength(FLAG)).toBe(1);
    expect(graphemeLength(THUMB + E_ACUTE + KEYCAP)).toBe(3);
    expect(graphemeLength('')).toBe(0);
    expect(graphemeLength('नमस्ते')).toBe(3);
  });
});

describe('truncate', () => {
  it('leaves text that fits untouched', () => {
    expect(truncate('hello', 5)).toBe('hello');
    expect(truncate(FAMILY + FLAG, 2)).toBe(FAMILY + FLAG);
  });

  it('keeps max graphemes in total, ellipsis included', () => {
    expect(truncate('hello world', 6)).toBe('hello…');
    expect(graphemeLength(truncate('abcdefghij', 4))).toBe(4);
    expect(truncate('abcdefghij', 4)).toBe('abc…');
  });

  it('never splits an emoji, flag or accented letter', () => {
    const text = `${FAMILY}${FLAG}${THUMB}${E_ACUTE}${KEYCAP}xyz`;
    expect(truncate(text, 3)).toBe(`${FAMILY}${FLAG}…`);
    expect(truncate(text, 5)).toBe(`${FAMILY}${FLAG}${THUMB}${E_ACUTE}…`);
    expect(truncate(`caf${E_ACUTE}s and more`, 5)).toBe(`caf${E_ACUTE}…`);
    expect(isWellFormed(truncate(`${FAMILY}${FAMILY}${FAMILY}`, 2))).toBe(true);
  });

  it('trims whitespace before the ellipsis', () => {
    expect(truncate('hello   world', 8)).toBe('hello…');
  });

  it('supports a custom ellipsis, counted in graphemes', () => {
    expect(truncate('abcdefghij', 6, '...')).toBe('abc...');
    expect(truncate('abcdefghij', 3, '...')).toBe('...');
    expect(truncate(`${FLAG}${FLAG}${FLAG}${FLAG}`, 3, ' ' + THUMB)).toBe(`${FLAG} ${THUMB}`);
  });

  it('rejects a max smaller than the ellipsis', () => {
    expect(() => truncate('abcdef', 2, '...')).toThrow(RangeError);
    expect(() => truncate('abcdef', 0)).toThrow(RangeError);
    expect(() => truncate('abcdef', 2.5)).toThrow(RangeError);
  });
});

describe('truncateBytes', () => {
  it('keeps ASCII up to the byte limit', () => {
    expect(truncateBytes('hello world', 5)).toBe('hello');
    expect(truncateBytes('hi', 10)).toBe('hi');
    expect(truncateBytes('hi', 0)).toBe('');
  });

  it('counts UTF-8 bytes, not UTF-16 units', () => {
    expect(truncateBytes('ééé', 4)).toBe('éé'); // é is 2 bytes
    expect(truncateBytes('ééé', 5)).toBe('éé');
    expect(truncateBytes('€€', 3)).toBe('€'); // € is 3 bytes but 1 code unit
  });

  it('drops a whole cluster that does not fit', () => {
    const text = `ab${FAMILY}cd`;
    expect(truncateBytes(text, 26)).toBe('ab');
    expect(truncateBytes(text, 27)).toBe(`ab${FAMILY}`);
    expect(truncateBytes(`x${E_ACUTE}`, 2)).toBe('x');
    expect(truncateBytes(`x${E_ACUTE}`, 4)).toBe(`x${E_ACUTE}`);
  });

  it('always returns well-formed text within the limit', () => {
    const text = `${THUMB}${FLAG}${KEYCAP}${FAMILY}日本語 ok`;
    for (let n = 0; n <= utf8(text) + 1; n++) {
      const out = truncateBytes(text, n);
      expect(utf8(out)).toBeLessThanOrEqual(n);
      expect(isWellFormed(out)).toBe(true);
      expect(text.startsWith(out)).toBe(true);
    }
  });

  it('rejects a bad limit', () => {
    expect(() => truncateBytes('x', -1)).toThrow(RangeError);
    expect(() => truncateBytes('x', 1.5)).toThrow(RangeError);
  });
});

describe('countWords', () => {
  it('counts words, not punctuation or spaces', () => {
    expect(countWords("Don't stop — it's 3.5 miles!", 'en')).toBe(5);
    expect(countWords('   ', 'en')).toBe(0);
    expect(countWords('', 'en')).toBe(0);
    expect(countWords('one,two;three', 'en')).toBe(3);
  });

  it('finds words in languages without spaces', () => {
    expect(countWords('私は猫です。', 'ja')).toBe(4);
    expect(countWords('สวัสดีครับ', 'th')).toBe(2);
  });
});
