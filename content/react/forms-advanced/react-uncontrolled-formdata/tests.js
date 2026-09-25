const { FeedbackForm } = solution;

// The grader's global FormData is Node's, which cannot read a <form>. In a
// browser (and here, during these tests) it is the DOM's own.
const NodeFormData = globalThis.FormData;
beforeEach(() => { globalThis.FormData = window.FormData; });
afterEach(() => { globalThis.FormData = NodeFormData; });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const field = (label) => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
const rating = (n) => within(screen.getByRole('group', { name: 'Rating' })).getByLabelText(String(n));
const form = () => field('Name').closest('form');
const submit = () => act(async () => { fireEvent.submit(form()); });
const sendButton = () => screen.getByRole('button', { name: 'Send feedback' });
const alertText = () => screen.queryByRole('alert')?.textContent ?? '';

function setup({ initial, result } = {}) {
  const sent = [];
  let pending = null;
  const onSubmit = (data) => {
    sent.push(data);
    if (result === 'manual') {
      pending = deferred();
      return pending.promise;
    }
    return Promise.resolve();
  };
  render(<FeedbackForm onSubmit={onSubmit} initial={initial} />);
  return {
    sent,
    resolve: () => act(async () => { pending.resolve(); }),
    reject: () => act(async () => { pending.reject(new Error('500')); }),
  };
}

function fillIn() {
  type('Name', '  Ada  ');
  fireEvent.click(rating(4));
  fireEvent.click(field('Docs'));
  fireEvent.click(field('UI'));
  type('Message', ' Great docs \n');
}

describe('FeedbackForm fields', () => {
  it('renders the named fields with their labels', () => {
    setup();
    expect(field('Name').getAttribute('name')).toBe('name');
    expect(field('Name').required).toBe(true);
    expect(rating(1).getAttribute('name')).toBe('rating');
    expect(rating(5).value).toBe('5');
    expect(field('Performance').value).toBe('performance');
    expect(field('Message').tagName).toBe('TEXTAREA');
    expect(field('Email me updates').getAttribute('name')).toBe('subscribe');
  });

  it('uses initial values as defaults', () => {
    setup({ initial: { name: 'Grace', rating: 5, topics: ['performance'], message: 'Hi', subscribe: true } });
    expect(field('Name').value).toBe('Grace');
    expect(rating(5).checked).toBe(true);
    expect(field('Performance').checked).toBe(true);
    expect(field('UI').checked).toBe(false);
    expect(field('Message').value).toBe('Hi');
    expect(field('Email me updates').checked).toBe(true);
  });
});

describe('FeedbackForm submitting', () => {
  it('sends typed, trimmed values', async () => {
    const { sent } = setup();
    fillIn();
    await submit();
    expect(sent).toStrictEqual([{
      name: 'Ada',
      rating: 4,
      topics: ['ui', 'docs'],
      message: 'Great docs',
      subscribe: false,
    }]);
  });

  it('sends subscribe as true when checked, and an empty topics array when none are', async () => {
    const { sent } = setup();
    type('Name', 'Ada');
    fireEvent.click(rating(2));
    fireEvent.click(field('Email me updates'));
    await submit();
    expect(sent[0].subscribe).toBe(true);
    expect(sent[0].topics).toEqual([]);
    expect(sent[0].rating).toBe(2);
  });

  it('does not send without a name', async () => {
    const { sent } = setup();
    fireEvent.click(rating(3));
    await submit();
    expect(sent).toEqual([]);
  });

  it('does not send without a rating', async () => {
    const { sent } = setup();
    type('Name', 'Ada');
    await submit();
    expect(sent).toEqual([]);
  });

  it('asks the browser to report the problems', async () => {
    setup();
    let reported = 0;
    form().reportValidity = () => { reported++; return false; };
    await submit();
    expect(reported).toBe(1);
  });

  it('resets to the defaults after a successful send', async () => {
    const { sent, resolve } = setup({ result: 'manual', initial: { name: 'Grace', rating: null, topics: [], message: '', subscribe: false } });
    type('Name', 'Ada');
    fireEvent.click(rating(4));
    fireEvent.click(field('Docs'));
    await submit();
    await resolve();
    expect(sent).toHaveLength(1);
    expect(field('Name').value).toBe('Grace');
    expect(rating(4).checked).toBe(false);
    expect(field('Docs').checked).toBe(false);
  });

  it('disables the button and ignores another submit while sending', async () => {
    const { sent, resolve } = setup({ result: 'manual' });
    fillIn();
    await submit();
    expect(sendButton().disabled).toBe(true);
    await submit();
    expect(sent).toHaveLength(1);
    await resolve();
    expect(sendButton().disabled).toBe(false);
  });

  it('keeps the values and shows an alert when sending fails', async () => {
    const { sent, reject, resolve } = setup({ result: 'manual' });
    fillIn();
    await submit();
    await reject();
    expect(alertText()).toBe('Could not send feedback');
    expect(field('Name').value).toBe('  Ada  ');
    expect(rating(4).checked).toBe(true);
    expect(sendButton().disabled).toBe(false);
    await submit();
    expect(alertText()).toBe('');
    await resolve();
    expect(sent).toHaveLength(2);
  });
});
