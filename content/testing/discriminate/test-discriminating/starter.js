// Your tests run against the correct slugify, a same-behaviour rewrite, and six bugs.
// `solution` (or `subject`) is the module under test.

describe('slugify', () => {
  it('lowercases and joins words with a dash', () => {
    expect(solution.slugify('Hello World')).toBe('hello-world');
  });

  // This passes against the correct code and catches nothing:
  // a title with no accents, no punctuation and nothing to trim is the happy path.
  it('keeps digits', () => {
    expect(solution.slugify('top 10 tips')).toBe('top-10-tips');
  });

  // TODO: one test per promise in the brief, each with an input that would
  // come out differently if that promise were broken.
});
