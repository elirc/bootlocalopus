const double = (n) => n * 2;
const inc = (n) => n + 1;
const str = (n) => 'n=' + n;

describe('pipe', () => {
  it('applies left to right', () => {
    expect(solution.pipe(double, inc)(5)).toBe(11);
    expect(solution.pipe(inc, double)(5)).toBe(12);
  });
  it('is the identity with no functions', () => {
    expect(solution.pipe()(42)).toBe(42);
  });
  it('passes every argument to the first function', () => {
    expect(solution.pipe((a, b) => a + b, double)(3, 4)).toBe(14);
  });
  it('composes more than two', () => {
    expect(solution.pipe(inc, double, str)(1)).toBe('n=4');
  });
});

describe('compose', () => {
  it('applies right to left', () => {
    expect(solution.compose(double, inc)(5)).toBe(12);
    expect(solution.compose(str, double, inc)(1)).toBe('n=4');
  });
  it('is the identity with no functions', () => {
    expect(solution.compose()('x')).toBe('x');
  });
});

describe('pipeAsync', () => {
  it('awaits each step', async () => {
    const load = async (id) => ({ id, tags: ['a', 'b'] });
    const count = (doc) => doc.tags.length;
    const label = async (n) => n + ' tags';
    expect(await solution.pipeAsync(load, count, label)(7)).toBe('2 tags');
  });
  it('runs steps in order, not in parallel', async () => {
    const order = [];
    const step = (name, ms) => async (v) => {
      await new Promise((r) => setTimeout(r, ms));
      order.push(name);
      return v;
    };
    await solution.pipeAsync(step('slow', 20), step('fast', 1))('x');
    expect(order).toEqual(['slow', 'fast']);
  });
  it('rejects if a step rejects', async () => {
    const boom = async () => { throw new Error('nope'); };
    await expect(solution.pipeAsync(boom, double)(1)).rejects.toThrow('nope');
  });
});