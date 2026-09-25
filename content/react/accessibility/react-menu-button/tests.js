const items = [
  { id: 'edit', label: 'Edit' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'archive', label: 'Archive', disabled: true },
  { id: 'delete', label: 'Delete' },
];

const button = () => screen.getByRole('button', { name: 'Actions' });
const menu = () => screen.queryByRole('menu');
const menuItems = () => screen.getAllByRole('menuitem');
const focused = () => document.activeElement.textContent;
const press = (key, extra = {}) => fireEvent.keyDown(document.activeElement, { key, ...extra });

function setup() {
  const selected = [];
  render(
    <div>
      <solution.MenuButton label="Actions" items={items} onSelect={(id) => selected.push(id)} />
      <p>Elsewhere on the page</p>
    </div>,
  );
  return selected;
}

function openWithClick() {
  fireEvent.click(button());
}

describe('MenuButton structure', () => {
  it('renders a collapsed menu button and no menu', () => {
    setup();
    expect(button().tagName).toBe('BUTTON');
    expect(button().getAttribute('aria-haspopup')).toBe('menu');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();
  });

  it('renders a labelled menu of menuitems when open', () => {
    setup();
    openWithClick();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(button().getAttribute('aria-controls')).toBe(menu().id);
    expect(menu().getAttribute('aria-labelledby')).toBe(button().id);
    expect(menuItems().map((i) => i.textContent)).toEqual(['Edit', 'Duplicate', 'Archive', 'Delete']);
    expect(menuItems().every((i) => i.tabIndex === -1)).toBe(true);
    expect(menuItems()[2].getAttribute('aria-disabled')).toBe('true');
    expect(menuItems()[0].getAttribute('aria-disabled')).toBeNull();
  });
});

describe('MenuButton opening and closing', () => {
  it('moves focus to the first item when opened with a click', () => {
    setup();
    openWithClick();
    expect(focused()).toBe('Edit');
  });

  it('opens on ArrowDown with the first item, and ArrowUp with the last', () => {
    setup();
    button().focus();
    press('ArrowDown');
    expect(focused()).toBe('Edit');
    press('Escape');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button());
    const notPrevented = fireEvent.keyDown(button(), { key: 'ArrowUp' });
    expect(notPrevented).toBe(false);
    expect(focused()).toBe('Delete');
  });

  it('closes on a second click of the button', () => {
    setup();
    openWithClick();
    fireEvent.mouseDown(button());
    fireEvent.click(button());
    // A document mousedown handler that counts the button as "outside" closes
    // the menu, and then the click reopens it.
    expect(menu()).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a mousedown outside, without moving focus', () => {
    setup();
    openWithClick();
    const other = screen.getByText('Elsewhere on the page');
    fireEvent.mouseDown(other);
    expect(menu()).toBeNull();
    expect(document.activeElement).not.toBe(button());
  });

  it('stays open on a mousedown inside the menu', () => {
    setup();
    openWithClick();
    fireEvent.mouseDown(menuItems()[1]);
    expect(menu()).toBeTruthy();
  });

  it('closes on Tab, returning focus to the button without cancelling the Tab', () => {
    setup();
    openWithClick();
    press('ArrowDown');
    const notPrevented = press('Tab');
    expect(notPrevented).toBe(true);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button());
  });
});

describe('MenuButton keyboard navigation', () => {
  it('moves down and up, wrapping, and focuses disabled items too', () => {
    setup();
    openWithClick();
    expect(press('ArrowDown')).toBe(false);
    expect(focused()).toBe('Duplicate');
    press('ArrowDown');
    expect(focused()).toBe('Archive');
    press('ArrowDown');
    press('ArrowDown');
    expect(focused()).toBe('Edit');
    press('ArrowUp');
    expect(focused()).toBe('Delete');
  });

  it('jumps with Home and End', () => {
    setup();
    openWithClick();
    expect(press('End')).toBe(false);
    expect(focused()).toBe('Delete');
    press('Home');
    expect(focused()).toBe('Edit');
  });

  it('moves to the next item starting with a typed character, wrapping', () => {
    setup();
    openWithClick();
    press('d');
    expect(focused()).toBe('Duplicate');
    press('D');
    expect(focused()).toBe('Delete');
    press('d');
    expect(focused()).toBe('Duplicate');
    press('a');
    expect(focused()).toBe('Archive');
    press('z');
    expect(focused()).toBe('Archive');
    expect(menu()).toBeTruthy();
  });
});

describe('MenuButton selecting', () => {
  it('selects with Enter, closes, and returns focus to the button', () => {
    const selected = setup();
    openWithClick();
    press('ArrowDown');
    expect(press('Enter')).toBe(false);
    expect(selected).toEqual(['duplicate']);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('selects with Space', () => {
    const selected = setup();
    openWithClick();
    press('End');
    expect(press(' ')).toBe(false);
    expect(selected).toEqual(['delete']);
    expect(document.activeElement).toBe(button());
  });

  it('selects with a click', () => {
    const selected = setup();
    openWithClick();
    fireEvent.click(menuItems()[0]);
    expect(selected).toEqual(['edit']);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('does nothing when a disabled item is chosen', () => {
    const selected = setup();
    openWithClick();
    press('a');
    press('Enter');
    fireEvent.click(menuItems()[2]);
    expect(selected).toEqual([]);
    expect(menu()).toBeTruthy();
  });

  it('can be opened again after a selection', () => {
    const selected = setup();
    openWithClick();
    press('Enter');
    openWithClick();
    expect(focused()).toBe('Edit');
    press('ArrowDown');
    press('Enter');
    expect(selected).toEqual(['edit', 'duplicate']);
  });
});
