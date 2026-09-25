const messages = [
  { id: 'm1', subject: 'Invoice overdue' },
  { id: 'm2', subject: 'Lunch on Friday?' },
  { id: 'm3', subject: 'Invoice paid' },
  { id: 'm4', subject: 'Deploy notes' },
];

const reset = () => { solution.renderLog.length = 0; };
const rowRenders = () => solution.renderLog.filter((e) => e.startsWith('row:'));
const rows = () => within(screen.getByRole('list', { name: 'Messages' })).queryAllByRole('listitem');
const subjects = () => rows().map((li) => li.textContent.replace(/Archive.*$/, '').trim());
const search = (value) => fireEvent.change(screen.getByLabelText('Search'), { target: { value } });
const toggle = (subject) => fireEvent.click(screen.getByRole('checkbox', { name: subject }));
const archive = (subject) => fireEvent.click(screen.getByRole('button', { name: 'Archive ' + subject }));
const status = () => screen.getByRole('status').textContent;

function setup(onArchive = () => {}) {
  const utils = render(<solution.InboxApp messages={messages} onArchive={(id) => onArchive(id)} />);
  return utils;
}

beforeEach(reset);

describe('Inbox: still correct', () => {
  it('lists every message and filters case-insensitively by subject', () => {
    setup();
    expect(subjects()).toEqual(['Invoice overdue', 'Lunch on Friday?', 'Invoice paid', 'Deploy notes']);
    search('INVOICE');
    expect(subjects()).toEqual(['Invoice overdue', 'Invoice paid']);
    search('');
    expect(rows()).toHaveLength(4);
  });

  it('keeps every selection when toggling one after another', () => {
    setup();
    toggle('Invoice overdue');
    toggle('Deploy notes');
    toggle('Lunch on Friday?');
    // A toggle that closed over an old Set drops the earlier selections.
    expect(status()).toBe('3 selected');
    toggle('Deploy notes');
    expect(status()).toBe('2 selected');
    expect(screen.getByRole('checkbox', { name: 'Invoice overdue' }).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Deploy notes' }).checked).toBe(false);
  });

  it('applies the density to every row', () => {
    setup();
    expect(rows().every((li) => li.getAttribute('data-density') === 'comfortable')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    expect(screen.getByRole('button', { name: 'Compact' }).getAttribute('aria-pressed')).toBe('true');
    expect(rows().every((li) => li.getAttribute('data-density') === 'compact')).toBe(true);
  });

  it('archives through the onArchive prop', () => {
    const archived = [];
    setup((id) => archived.push(id));
    archive('Deploy notes');
    expect(archived).toEqual(['m4']);
  });

  it('calls the latest onArchive after the parent re-renders, not the first one', () => {
    const first = [];
    const second = [];
    const { rerender } = render(<solution.InboxApp messages={messages} onArchive={(id) => first.push(id)} />);
    rerender(<solution.InboxApp messages={messages} onArchive={(id) => second.push(id)} />);
    archive('Lunch on Friday?');
    expect(first).toEqual([]);
    expect(second).toEqual(['m2']);
  });
});

describe('Inbox: and only then fast', () => {
  it('memoises the row component', () => {
    expect(String(solution.MessageRow.$$typeof)).toContain('memo');
  });

  it('does not re-render any surviving row while the user types', () => {
    setup();
    reset();
    search('i');
    search('in');
    search('inv');
    expect(solution.renderLog).toContain('app');
    expect(subjects()).toEqual(['Invoice overdue', 'Invoice paid']);
    // Rows read the density from context. A context value that also carries
    // the query (or is a new object each render) re-renders every row here.
    expect(rowRenders()).toEqual([]);
  });

  it('renders only the rows that come back when the search is cleared', () => {
    setup();
    search('invoice');
    reset();
    search('');
    expect(rowRenders().sort()).toEqual(['row:m2', 'row:m4']);
  });

  it('re-renders only the toggled row, on every toggle', () => {
    setup();
    reset();
    toggle('Lunch on Friday?');
    expect(rowRenders()).toEqual(['row:m2']);
    reset();
    toggle('Invoice paid');
    // A callback that depends on the selection is new after every toggle,
    // and hands every row a new prop.
    expect(rowRenders()).toEqual(['row:m3']);
  });

  it('re-renders every row once when the density changes', () => {
    setup();
    reset();
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    expect(rowRenders().sort()).toEqual(['row:m1', 'row:m2', 'row:m3', 'row:m4']);
  });

  it('does not re-render rows when the parent re-renders with a new inline onArchive', () => {
    const { rerender } = setup();
    reset();
    rerender(<solution.InboxApp messages={messages} onArchive={() => {}} />);
    rerender(<solution.InboxApp messages={messages} onArchive={() => {}} />);
    expect(solution.renderLog).toContain('app');
    expect(rowRenders()).toEqual([]);
  });

  it('re-renders only the message that changed when a new list arrives', () => {
    const { rerender } = setup();
    reset();
    const next = [messages[0], { ...messages[1], subject: 'Lunch on Saturday?' }, messages[2], messages[3]];
    rerender(<solution.InboxApp messages={next} onArchive={() => {}} />);
    expect(rowRenders()).toEqual(['row:m2']);
    expect(subjects()[1]).toBe('Lunch on Saturday?');
  });
});
