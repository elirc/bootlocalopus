describe('slugify', () => {
  const slugify = (...args) => solution.slugify(...args);

  it('lowercases', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('folds accented letters to their base letter', () => {
    expect(slugify('Café Crème Brûlée')).toBe('cafe-creme-brulee');
  });

  it('collapses a run of separators into one dash', () => {
    expect(slugify('rock  &  roll -- live!')).toBe('rock-roll-live');
  });

  it('never starts or ends with a dash', () => {
    expect(slugify('  -Hello!- ')).toBe('hello');
  });

  describe('truncation', () => {
    it('cuts after the last whole word that fits', () => {
      expect(slugify('one two three', { maxLength: 9 })).toBe('one-two');
    });

    it('keeps an exact fit whole', () => {
      expect(slugify('one two three', { maxLength: 7 })).toBe('one-two');
      expect(slugify('one two three', { maxLength: 13 })).toBe('one-two-three');
    });

    it('cuts a single over-long word at maxLength', () => {
      expect(slugify('supercalifragilistic', { maxLength: 5 })).toBe('super');
    });

    it('never exceeds the default of 60 characters', () => {
      const out = slugify('word '.repeat(30));
      expect(out.length).toBeLessThanOrEqual(60);
      expect(out).toMatch(/^word(-word)*$/);
    });
  });

  describe('empty input', () => {
    it('returns an empty string for an empty title', () => {
      expect(slugify('')).toBe('');
    });

    it('returns an empty string for whitespace or punctuation only', () => {
      expect(slugify('   ')).toBe('');
      expect(slugify('!?! -- ')).toBe('');
    });
  });
});
