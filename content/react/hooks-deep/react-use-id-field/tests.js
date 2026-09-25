const TextField = (props) => <solution.TextField {...props} />;
const input = () => screen.getByRole('textbox');

describe('TextField', () => {
  it('associates the label with the input', () => {
    render(<TextField label="Email" />);
    const el = screen.getByLabelText('Email');
    expect(el.tagName).toBe('INPUT');
    expect(el.id).not.toBe('');
  });

  it('gives two fields different ids', () => {
    render(<div><TextField label="First" /><TextField label="Second" /></div>);
    const a = screen.getByLabelText('First');
    const b = screen.getByLabelText('Second');
    expect(a).not.toBe(b);
    expect(a.id).not.toBe(b.id);
  });

  it('keeps its ids stable across re-renders', () => {
    const { rerender } = render(<TextField label="Email" hint="Work address" />);
    const id = input().id;
    const hintId = input().getAttribute('aria-describedby');
    rerender(<TextField label="Email" hint="Work address" name="email" placeholder="you@work.com" />);
    expect(input().id).toBe(id);
    expect(input().getAttribute('aria-describedby')).toBe(hintId);
  });

  it('uses the caller\'s id when given', () => {
    render(<TextField label="Email" id="signup-email" />);
    expect(screen.getByLabelText('Email').id).toBe('signup-email');
  });

  it('omits aria-describedby and aria-invalid with no hint or error', () => {
    render(<TextField label="Email" />);
    expect(input().hasAttribute('aria-describedby')).toBe(false);
    expect(input().hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('points aria-describedby at the hint', () => {
    render(<TextField label="Email" hint="We never share it" />);
    const ids = input().getAttribute('aria-describedby').split(' ');
    expect(ids).toHaveLength(1);
    expect(document.getElementById(ids[0]).textContent).toBe('We never share it');
  });

  it('lists hint then error, and marks the input invalid', () => {
    render(<TextField label="Email" hint="We never share it" error="Enter a valid email" />);
    const ids = input().getAttribute('aria-describedby').split(' ');
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0]).textContent).toBe('We never share it');
    expect(document.getElementById(ids[1]).textContent).toBe('Enter a valid email');
    expect(document.getElementById(ids[1]).getAttribute('role')).toBe('alert');
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });

  it('describes by the error alone when there is no hint', () => {
    render(<TextField label="Email" error="Required" />);
    const ids = input().getAttribute('aria-describedby').split(' ');
    expect(ids).toHaveLength(1);
    expect(document.getElementById(ids[0]).textContent).toBe('Required');
  });

  it('gives each field its own hint id', () => {
    render(<div><TextField label="A" hint="hint a" /><TextField label="B" hint="hint b" /></div>);
    const a = screen.getByLabelText('A').getAttribute('aria-describedby');
    const b = screen.getByLabelText('B').getAttribute('aria-describedby');
    expect(a).not.toBe(b);
    expect(document.getElementById(b).textContent).toBe('hint b');
  });

  it('passes other props to the input', () => {
    let last;
    render(<TextField label="Email" name="email" type="email" value="x" onChange={(e) => { last = e.target.value; }} />);
    const el = screen.getByLabelText('Email');
    expect(el.getAttribute('name')).toBe('email');
    expect(el.getAttribute('type')).toBe('email');
    fireEvent.change(el, { target: { value: 'y' } });
    expect(last).toBe('y');
  });

  it('hydrates server-rendered markup without an id mismatch', async () => {
    const { renderToString } = await import('react-dom/server');
    const { hydrateRoot } = await import('react-dom/client');
    const Form = () => (
      <form>
        <TextField label="Name" hint="As on your card" />
        <TextField label="Email" error="Required" />
      </form>
    );
    // The browser has usually rendered other fields before this one.
    render(<TextField label="Elsewhere" />);
    const html = renderToString(<Form />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.map(String).join(' '));
    let root;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Form />, { onRecoverableError: (e) => errors.push(String(e)) });
      });
    } finally {
      console.error = original;
      act(() => root && root.unmount());
      container.remove();
    }
    expect(errors.join('\n')).toBe('');
  });
});
