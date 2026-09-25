const { extractActionItems } = solution;

const TODAY = { today: '2024-05-06' };
const one = (line, opts = TODAY) => extractActionItems(line, opts).items[0];

describe('extractActionItems: the example from the brief', () => {
  it('parses items and groups the open ones', () => {
    const notes = [
      '## Actions',
      '- [ ] @Priya add a retry to the webhook consumer (due 2024-05-10)',
      '- [x] @sam rotate the staging API key due 2024-05-02',
      '- [ ] look into the flaky checkout test',
    ].join('\n');
    expect(extractActionItems(notes, TODAY)).toEqual({
      items: [
        { owner: 'priya', text: 'add a retry to the webhook consumer', due: '2024-05-10', done: false, problems: [] },
        { owner: 'sam', text: 'rotate the staging API key', due: '2024-05-02', done: true, problems: [] },
        { owner: null, text: 'look into the flaky checkout test', due: null, done: false, problems: ['no-owner', 'no-due-date', 'vague'] },
      ],
      openByOwner: {
        priya: ['add a retry to the webhook consumer'],
        '(unassigned)': ['look into the flaky checkout test'],
      },
    });
  });
});

describe('extractActionItems: finding items', () => {
  it('only reads checkbox lines, indented or not, ticked with x or X', () => {
    const notes = [
      '# Retro 2024-05-06',
      'We should add alerts. @kim agreed.',
      '- a plain bullet @kim due 2024-06-01',
      '  - [ ] @kim add an alert on queue depth due 2024-06-01',
      '- [X] @lee update the runbook due 2024-05-01',
      '-[ ] @lee not a checkbox (no space)',
    ].join('\n');
    const { items } = extractActionItems(notes, TODAY);
    expect(items.map((i) => [i.owner, i.done])).toEqual([['kim', false], ['lee', true]]);
  });

  it('returns nothing for notes without items', () => {
    expect(extractActionItems('Nothing decided today.', TODAY)).toEqual({ items: [], openByOwner: {} });
  });
});

describe('extractActionItems: owner, due date and text', () => {
  it('takes the first @handle as the owner, lower-cased, and removes only that one', () => {
    const item = one('- [ ] pair with @Jo_Ann-2 and @lee on the flaky test fix due 2024-05-20');
    expect(item.owner).toBe('jo_ann-2');
    expect(item.text).toBe('pair with and @lee on the flaky test fix');
  });

  it('removes the due phrase with or without parentheses, in any case, and tidies spaces', () => {
    expect(one('- [ ] @kim ship the fix (due 2024-05-20) today').text).toBe('ship the fix today');
    expect(one('- [ ] @kim   ship   the fix DUE 2024-05-20').text).toBe('ship the fix');
    expect(one('- [ ] @kim ship the fix Due 2024-05-20').due).toBe('2024-05-20');
  });

  it('only reads due as a whole word', () => {
    const item = one('- [ ] @kim chase the overdue 2024-04-01 invoices');
    expect(item.due).toBeNull();
    expect(item.problems).toEqual(['no-due-date']);
  });

  it('treats @Priya and @priya as the same owner', () => {
    const notes = '- [ ] @Priya write the ADR due 2024-05-09\n- [ ] @priya book the review due 2024-05-09';
    expect(extractActionItems(notes, TODAY).openByOwner).toEqual({ priya: ['write the ADR', 'book the review'] });
  });
});

describe('extractActionItems: problems', () => {
  it('flags open items with no owner or no due date, in that order', () => {
    expect(one('- [ ] add alerting due 2024-05-20').problems).toEqual(['no-owner']);
    expect(one('- [ ] @kim add alerting').problems).toEqual(['no-due-date']);
    expect(one('- [ ] add alerting').problems).toEqual(['no-owner', 'no-due-date']);
  });

  it('flags a due date that does not exist', () => {
    expect(one('- [ ] @kim add alerting due 2024-02-30').problems).toEqual(['bad-due-date']);
    expect(one('- [ ] @kim add alerting due 2024-13-01').problems).toEqual(['bad-due-date']);
    expect(one('- [ ] @kim add alerting due 2023-02-29').problems).toEqual(['bad-due-date']);
    expect(one('- [ ] @kim add alerting due 2024-02-29').problems).toEqual(['overdue']);
  });

  it('flags a due date before today, but not today', () => {
    expect(one('- [ ] @kim add alerting due 2024-05-05').problems).toEqual(['overdue']);
    expect(one('- [ ] @kim add alerting due 2024-05-06').problems).toEqual([]);
    expect(one('- [ ] @kim add alerting due 2024-05-05', { today: '2024-05-05' }).problems).toEqual([]);
  });

  it('flags vague items by how the remaining text starts, in any case', () => {
    for (const start of ['Look into', 'investigate', 'THINK ABOUT', 'consider', 'discuss', 'Follow up']) {
      expect(one(`- [ ] @kim ${start} the retry storm due 2024-05-20`).problems).toEqual(['vague']);
    }
    expect(one('- [ ] @kim write up what we learned investigating the retry storm due 2024-05-20').problems).toEqual([]);
  });

  it('reports every problem of an open item, in order', () => {
    expect(one('- [ ] discuss the on-call rota due 2024-01-01').problems).toEqual(['no-owner', 'overdue', 'vague']);
  });

  it('never flags a done item', () => {
    expect(one('- [x] look into it due 2020-01-01').problems).toEqual([]);
    expect(one('- [x] something').problems).toEqual([]);
  });
});

describe('extractActionItems: openByOwner', () => {
  it('lists open items per owner in note order, and leaves out owners with nothing open', () => {
    const notes = [
      '- [ ] @kim one due 2024-05-20',
      '- [x] @lee done already due 2024-05-01',
      '- [ ] nobody owns this',
      '- [ ] @kim two due 2024-05-21',
    ].join('\n');
    expect(extractActionItems(notes, TODAY).openByOwner).toEqual({ kim: ['one', 'two'], '(unassigned)': ['nobody owns this'] });
  });
});
