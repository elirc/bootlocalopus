const { MoneyInput } = solution;

function Price({ initial = null, log }) {
  const [cents, setCents] = React.useState(initial);
  return (
    <div>
      <MoneyInput
        label="Price"
        valueCents={cents}
        onChange={(c) => { log.push(c); setCents(c); }}
      />
      <output>{String(cents)}</output>
      <button type="button" onClick={() => setCents(999)}>Reset</button>
    </div>
  );
}

const input = () => screen.getByLabelText('Price');
const type = (value) => fireEvent.change(input(), { target: { value } });
const focusIt = () => act(() => { input().focus(); });
const blurIt = () => act(() => { input().blur(); });
const stored = () => document.querySelector('output').textContent;
const error = () => {
  const id = input().getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent ?? null : null;
};

function setup(initial = null) {
  const log = [];
  render(<Price initial={initial} log={log} />);
  return log;
}

describe('MoneyInput formats', () => {
  it('renders a labelled text input for decimals', () => {
    setup();
    expect(input().getAttribute('type')).toBe('text');
    expect(input().getAttribute('inputmode')).toBe('decimal');
    expect(input().value).toBe('');
  });

  it('displays cents with separators and two decimals', () => {
    setup(123456);
    expect(input().value).toBe('1,234.56');
  });

  it('pads small amounts', () => {
    setup(5);
    expect(input().value).toBe('0.05');
  });

  it('drops the separators while editing and restores them on blur', () => {
    setup(123456);
    focusIt();
    expect(input().value).toBe('1234.56');
    blurIt();
    expect(input().value).toBe('1,234.56');
  });
});

describe('MoneyInput parsing', () => {
  it('converts to cents without floating-point error', () => {
    setup();
    focusIt();
    type('1.15');
    expect(stored()).toBe('115');
    type('0.29');
    expect(stored()).toBe('29');
    type('19.99');
    expect(stored()).toBe('1999');
    type('12345678.91');
    expect(stored()).toBe('1234567891');
  });

  it('accepts whole numbers, a trailing dot, one decimal and a leading dot', () => {
    setup();
    focusIt();
    type('12');
    expect(stored()).toBe('1200');
    type('12.');
    expect(stored()).toBe('1200');
    type('12.5');
    expect(stored()).toBe('1250');
    type('.5');
    expect(stored()).toBe('50');
  });

  it('ignores commas and surrounding spaces', () => {
    setup();
    focusIt();
    type(' 1,234.5 ');
    expect(stored()).toBe('123450');
  });

  it('reports an empty field as null, not 0', () => {
    const log = setup(1200);
    focusIt();
    type('');
    expect(log).toEqual([null]);
    expect(stored()).toBe('null');
  });

  it('rejects malformed amounts without calling onChange', () => {
    const log = setup(1200);
    focusIt();
    for (const bad of ['12.345', '1.2.3', 'abc', '.', '12a', '-5']) {
      type(bad);
      expect(input().getAttribute('aria-invalid')).toBe('true');
      expect(error()).toBe('Enter an amount like 12.50');
    }
    expect(log).toEqual([]);
    expect(stored()).toBe('1200');
  });

  it('clears the error as soon as the text is valid again', () => {
    setup();
    focusIt();
    type('12.345');
    type('12.34');
    expect(input().getAttribute('aria-invalid')).toBeNull();
    expect(input().getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText('Enter an amount like 12.50')).toBeNull();
  });

  it('does not call onChange when the value did not change', () => {
    const log = setup(1200);
    focusIt();
    type('12.0');
    type('12.00');
    expect(log).toEqual([]);
  });
});

describe('MoneyInput text versus value', () => {
  it('keeps what the user is typing when the parent echoes it back', () => {
    setup();
    focusIt();
    type('12.');
    // The parent now holds 1200; rewriting the text to "12.00" would move
    // the caret and make "12.5" impossible to type.
    expect(input().value).toBe('12.');
    type('12.5');
    expect(input().value).toBe('12.5');
    expect(stored()).toBe('1250');
  });

  it('reformats valid text on blur', () => {
    setup();
    focusIt();
    type('1234.5');
    blurIt();
    expect(input().value).toBe('1,234.50');
  });

  it('leaves invalid text and its error in place on blur', () => {
    setup(1200);
    focusIt();
    type('12.345');
    blurIt();
    expect(input().value).toBe('12.345');
    expect(error()).toBe('Enter an amount like 12.50');
    expect(stored()).toBe('1200');
  });

  it('shows a new value from the parent while not focused, formatted for display', () => {
    const { rerender } = render(<MoneyInput label="Price" valueCents={1200} onChange={() => {}} />);
    rerender(<MoneyInput label="Price" valueCents={250000} onChange={() => {}} />);
    expect(input().value).toBe('2,500.00');
    rerender(<MoneyInput label="Price" valueCents={null} onChange={() => {}} />);
    expect(input().value).toBe('');
  });

  it('replaces the text with an outside change while focused, in the editing format', () => {
    setup();
    focusIt();
    type('12.3');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(stored()).toBe('999');
    expect(input().value).toBe('9.99');
    expect(document.activeElement).toBe(input());
  });

  it('replaces invalid text when the parent sets a value', () => {
    setup(1200);
    focusIt();
    type('oops');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(input().value).toBe('9.99');
    expect(input().getAttribute('aria-invalid')).toBeNull();
  });
});
