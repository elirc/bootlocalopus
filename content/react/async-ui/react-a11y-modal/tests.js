const Harness = ({ startOpen = false }) => {
  const [open, setOpen] = React.useState(startOpen);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open settings</button>
      <solution.Modal open={open} onClose={() => setOpen(false)} title="Settings">
        <p>Body content</p>
      </solution.Modal>
    </div>
  );
};

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<solution.Modal open={false} onClose={() => {}} title="Settings">body</solution.Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('body')).toBeNull();
  });

  it('renders a labelled modal dialog when open', () => {
    render(<solution.Modal open onClose={() => {}} title="Settings"><p>Body content</p></solution.Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Body content')).toBeTruthy();

    // aria-labelledby must actually point at the heading holding the title.
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const heading = document.getElementById(labelId);
    expect(heading).toBeTruthy();
    expect(heading.textContent).toBe('Settings');
    expect(heading.tagName).toBe('H2');
  });

  it('is findable by its accessible name', () => {
    render(<solution.Modal open onClose={() => {}} title="Settings">x</solution.Modal>);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
  });

  it('closes via the Close button', () => {
    let closed = 0;
    render(<solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(1);
  });

  it('closes on Escape', () => {
    let closed = 0;
    render(<solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(1);
  });

  it('ignores other keys', () => {
    let closed = 0;
    render(<solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>);
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(closed).toBe(0);
  });

  it('moves focus into the dialog when it opens', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement === dialog || dialog.contains(document.activeElement)).toBe(true);
  });

  it('returns focus to the trigger when it closes', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps focus where the user put it when the parent re-renders', () => {
    // A form inside the dialog: every keystroke re-renders the parent, which
    // passes a brand-new inline onClose each time.
    function FormHarness() {
      const [open, setOpen] = React.useState(false);
      const [name, setName] = React.useState('');
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open settings</button>
          <solution.Modal open={open} onClose={() => setOpen(false)} title="Settings">
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </solution.Modal>
        </div>
      );
    }
    render(<FormHarness />);
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByLabelText('Name');
    input.focus();
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.change(input, { target: { value: 'Ad' } });
    expect(document.activeElement).toBe(input);
    // Escape still reaches the latest onClose, and focus still goes home.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('removes its key listener when closed', () => {
    let closed = 0;
    const { rerender } = render(
      <solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>,
    );
    rerender(<solution.Modal open={false} onClose={() => closed++} title="Settings">x</solution.Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(0);
  });

  it('removes its key listener on unmount', () => {
    let closed = 0;
    const { unmount } = render(
      <solution.Modal open onClose={() => closed++} title="Settings">x</solution.Modal>,
    );
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(0);
  });
});