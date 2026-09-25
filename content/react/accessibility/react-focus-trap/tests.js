const { FocusTrap } = solution;

const tab = (shiftKey = false) => fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey });
const byName = (name) => screen.getByRole('button', { name });

// A page with a button that opens a trapped panel.
function Page({ children, extra = null }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <input aria-label="Outside field" />
      {open && (
        <FocusTrap>
          {children}
          <button type="button" onClick={() => setOpen(false)}>Close</button>
        </FocusTrap>
      )}
      {extra}
    </div>
  );
}

function openPanel() {
  byName('Open').focus();
  fireEvent.click(byName('Open'));
}

describe('FocusTrap activation', () => {
  it('focuses the first tabbable element when it opens', () => {
    render(<Page><input aria-label="Name" /><button type="button">Save</button></Page>);
    openPanel();
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
  });

  it('skips disabled, tabindex=-1, hidden inputs and hidden content', () => {
    render(
      <Page>
        <button type="button" disabled>Disabled</button>
        <span tabIndex={-1}>Not tabbable</span>
        <input type="hidden" name="csrf" />
        <div hidden><button type="button">Hidden</button></div>
        <a>Not a link without href</a>
        <a href="#terms">Terms</a>
      </Page>,
    );
    openPanel();
    expect(document.activeElement.textContent).toBe('Terms');
  });

  it('focuses the container when there is nothing tabbable', () => {
    render(<FocusTrap><p>Just text</p></FocusTrap>);
    const container = screen.getByText('Just text').parentElement;
    expect(document.activeElement).toBe(container);
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(container);
  });

  it('honours initialFocusRef', () => {
    function WithInitial() {
      const ref = React.useRef(null);
      return (
        <FocusTrap initialFocusRef={ref}>
          <button type="button">First</button>
          <button type="button" ref={ref}>Preferred</button>
        </FocusTrap>
      );
    }
    render(<WithInitial />);
    expect(document.activeElement).toBe(byName('Preferred'));
  });

  it('does nothing while inactive, and focuses in when activated', () => {
    function Toggle({ active }) {
      return (
        <div>
          <input aria-label="Outside field" />
          <FocusTrap active={active}><button type="button">Inside</button></FocusTrap>
        </div>
      );
    }
    const { rerender } = render(<Toggle active={false} />);
    screen.getByLabelText('Outside field').focus();
    rerender(<Toggle active={false} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Outside field'));
    byName('Inside').focus();
    expect(tab()).toBe(true);
    rerender(<Toggle active />);
    expect(document.activeElement).toBe(byName('Inside'));
  });

  it('does not steal focus back on a re-render while active', () => {
    function Form() {
      const [value, setValue] = React.useState('');
      return (
        <FocusTrap>
          <input aria-label="First" />
          <input aria-label="Second" value={value} onChange={(e) => setValue(e.target.value)} />
        </FocusTrap>
      );
    }
    render(<Form />);
    screen.getByLabelText('Second').focus();
    fireEvent.change(screen.getByLabelText('Second'), { target: { value: 'typing' } });
    expect(document.activeElement).toBe(screen.getByLabelText('Second'));
  });
});

describe('FocusTrap wrapping', () => {
  function openThree() {
    render(<Page><input aria-label="Name" /><button type="button">Save</button></Page>);
    openPanel();
  }

  it('wraps Tab from the last element to the first', () => {
    openThree();
    byName('Close').focus();
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    openThree();
    expect(tab(true)).toBe(false);
    expect(document.activeElement).toBe(byName('Close'));
  });

  it('leaves Tab alone in the middle', () => {
    openThree();
    byName('Save').focus();
    expect(tab()).toBe(true);
    expect(tab(true)).toBe(true);
    expect(document.activeElement).toBe(byName('Save'));
  });

  it('treats Tab on the container itself as an edge', () => {
    openThree();
    const container = byName('Save').parentElement;
    container.focus();
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    container.focus();
    expect(tab(true)).toBe(false);
    expect(document.activeElement).toBe(byName('Close'));
  });

  it('includes elements added after it opened', () => {
    function Growing() {
      const [retry, setRetry] = React.useState(false);
      return (
        <FocusTrap>
          <button type="button" onClick={() => setRetry(true)}>Submit</button>
          {retry && <button type="button">Retry</button>}
        </FocusTrap>
      );
    }
    render(<Growing />);
    // Only one tabbable so far: Tab wraps onto itself.
    expect(document.activeElement).toBe(byName('Submit'));
    expect(tab()).toBe(false);
    fireEvent.click(byName('Submit'));
    byName('Submit').focus();
    // Submit is no longer the last tabbable, so this Tab is left alone.
    expect(tab()).toBe(true);
    byName('Retry').focus();
    expect(tab()).toBe(false);
    expect(document.activeElement).toBe(byName('Submit'));
  });

  it('ignores keys other than Tab', () => {
    openThree();
    byName('Close').focus();
    expect(fireEvent.keyDown(document.activeElement, { key: 'Enter' })).toBe(true);
    expect(document.activeElement).toBe(byName('Close'));
  });
});

describe('FocusTrap restoring focus', () => {
  it('returns focus to the opener when it unmounts', () => {
    render(<Page><input aria-label="Name" /></Page>);
    openPanel();
    fireEvent.click(byName('Close'));
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(document.activeElement).toBe(byName('Open'));
  });

  it('returns focus when deactivated without unmounting', () => {
    function Toggle({ active }) {
      return (
        <div>
          <input aria-label="Outside field" />
          <FocusTrap active={active}><button type="button">Inside</button></FocusTrap>
        </div>
      );
    }
    const { rerender } = render(<Toggle active={false} />);
    screen.getByLabelText('Outside field').focus();
    rerender(<Toggle active />);
    expect(document.activeElement).toBe(byName('Inside'));
    rerender(<Toggle active={false} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Outside field'));
    byName('Inside').focus();
    expect(tab()).toBe(true);
  });
});
