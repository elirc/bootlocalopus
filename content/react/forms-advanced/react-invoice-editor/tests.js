const { InvoiceEditor } = solution;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const field = (n, name) => screen.getByLabelText(`Line ${n} ${name}`);
const type = (n, name, value) => fireEvent.change(field(n, name), { target: { value } });
const lineTotal = (n) => screen.getByLabelText(`Line ${n} total`).textContent;
const total = () => screen.getByLabelText('Total').textContent;
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const alertText = () => screen.getByRole('alert').textContent;
const errorOf = (n, name) => {
  const id = field(n, name).getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent ?? null : null;
};
const save = () => act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')); });
const descriptions = () => screen.queryAllByLabelText(/^Line \d+ description$/).map((el) => el.value);

function fillLine(n, description, quantity, price) {
  type(n, 'description', description);
  type(n, 'quantity', quantity);
  type(n, 'unit price', price);
}

function setup() {
  const sent = [];
  const pending = [];
  const onSubmit = (invoice) => {
    sent.push(invoice);
    const d = deferred();
    pending.push(d);
    return d.promise;
  };
  render(<InvoiceEditor onSubmit={onSubmit} />);
  return {
    sent,
    resolve: () => act(async () => { pending.at(-1).resolve(); }),
    reject: (error) => act(async () => { pending.at(-1).reject(error); }),
  };
}

function serverError(details) {
  const error = new Error('Unprocessable');
  error.details = details;
  return error;
}

describe('InvoiceEditor lines and totals', () => {
  it('starts with one empty line and a zero total', () => {
    setup();
    expect(descriptions()).toEqual(['']);
    expect(lineTotal(1)).toBe('—');
    expect(total()).toBe('$0.00');
  });

  it('computes line totals and the invoice total in integer cents', () => {
    setup();
    fillLine(1, 'Widgets', '3', '1.15');
    click('Add line');
    fillLine(2, 'Consulting', '10', '120.5');
    expect(lineTotal(1)).toBe('$3.45');
    expect(lineTotal(2)).toBe('$1,205.00');
    expect(total()).toBe('$1,208.45');
  });

  it('shows a dash for a line that does not parse and leaves it out of the total', () => {
    setup();
    fillLine(1, 'Widgets', '2', '12.345');
    click('Add line');
    fillLine(2, 'Bolts', '0', '1');
    click('Add line');
    fillLine(3, 'Nuts', ' 4 ', ' .5 ');
    expect(lineTotal(1)).toBe('—');
    expect(lineTotal(2)).toBe('—');
    expect(lineTotal(3)).toBe('$2.00');
    expect(total()).toBe('$2.00');
  });

  it('adds a line and focuses its description', () => {
    setup();
    click('Add line');
    expect(document.activeElement).toBe(field(2, 'description'));
  });

  it('removes a line, keeps the others in their own inputs, and moves focus to the next', () => {
    setup();
    fillLine(1, 'A', '1', '1');
    click('Add line');
    fillLine(2, 'B', '1', '1');
    click('Add line');
    fillLine(3, 'C', '1', '1');
    const cInput = field(3, 'description');
    click('Remove line 2');
    expect(descriptions()).toEqual(['A', 'C']);
    expect(field(2, 'description')).toBe(cInput);
    expect(document.activeElement).toBe(cInput);
    click('Remove line 2');
    expect(document.activeElement).toBe(field(1, 'description'));
    click('Remove line 1');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add line' }));
  });
});

describe('InvoiceEditor validation', () => {
  it('shows nothing before the first submit attempt', () => {
    setup();
    type(1, 'quantity', 'lots');
    expect(errorOf(1, 'quantity')).toBeNull();
    expect(field(1, 'quantity').getAttribute('aria-invalid')).toBeNull();
  });

  it('shows every problem on submit and focuses the first one in document order', async () => {
    const { sent } = setup();
    fillLine(1, 'Widgets', '2', '3');
    click('Add line');
    fillLine(2, '  ', '1.5', 'abc');
    await save();
    expect(sent).toEqual([]);
    expect(errorOf(1, 'description')).toBeNull();
    expect(errorOf(2, 'description')).toBe('Enter a description');
    expect(errorOf(2, 'quantity')).toBe('Enter a whole number above 0');
    expect(errorOf(2, 'unit price')).toBe('Enter a price like 12.50');
    expect(field(2, 'quantity').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field(2, 'description'));
  });

  it('follows every change after the first attempt', async () => {
    setup();
    await save();
    expect(errorOf(1, 'quantity')).toBe('Enter a whole number above 0');
    type(1, 'quantity', '2');
    expect(errorOf(1, 'quantity')).toBeNull();
    type(1, 'quantity', '0');
    expect(errorOf(1, 'quantity')).toBe('Enter a whole number above 0');
  });

  it('asks for at least one line', async () => {
    const { sent } = setup();
    click('Remove line 1');
    await save();
    expect(alertText()).toBe('Add at least one line');
    expect(sent).toEqual([]);
  });
});

describe('InvoiceEditor saving', () => {
  it('sends the parsed invoice once and disables Save while pending', async () => {
    const { sent, resolve } = setup();
    fillLine(1, ' Widgets ', '3', '1.15');
    click('Add line');
    fillLine(2, 'Consulting', '10', '120.5');
    await save();
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
    await save();
    expect(sent).toStrictEqual([{
      lines: [
        { description: 'Widgets', quantity: 3, unitPriceCents: 115 },
        { description: 'Consulting', quantity: 10, unitPriceCents: 12050 },
      ],
    }]);
    await resolve();
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false);
  });

  it('shows server errors on the fields they name and focuses the first', async () => {
    const { reject } = setup();
    fillLine(1, 'Widgets', '3', '1');
    click('Add line');
    fillLine(2, 'Bolts', '500', '1');
    await save();
    await reject(serverError({ 'lines.1.quantity': 'Only 120 in stock', 'lines.0.unitPrice': 'Below cost price' }));
    expect(errorOf(1, 'unit price')).toBe('Below cost price');
    expect(errorOf(2, 'quantity')).toBe('Only 120 in stock');
    expect(field(2, 'quantity').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field(1, 'unit price'));
    expect(alertText()).toBe('');
  });

  it('clears a server error when its field is edited', async () => {
    const { reject } = setup();
    fillLine(1, 'Bolts', '500', '1');
    await save();
    await reject(serverError({ 'lines.0.quantity': 'Only 120 in stock' }));
    type(1, 'quantity', '100');
    expect(errorOf(1, 'quantity')).toBeNull();
  });

  it('maps server errors to the lines as they were when Save was pressed', async () => {
    const { reject } = setup();
    fillLine(1, 'A', '1', '1');
    click('Add line');
    fillLine(2, 'B', '1', '1');
    click('Add line');
    fillLine(3, 'C', '1', '1');
    await save();
    // While the request is in flight the user removes A and adds D.
    click('Remove line 1');
    click('Add line');
    fillLine(3, 'D', '1', '1');
    await reject(serverError({
      'lines.2.description': 'C is discontinued',
      'lines.0.quantity': 'A needs a minimum of 5',
    }));
    expect(descriptions()).toEqual(['B', 'C', 'D']);
    // Index 2 meant C, which is now line 2. Index 0 meant A, which is gone.
    expect(errorOf(2, 'description')).toBe('C is discontinued');
    expect(errorOf(1, 'quantity')).toBeNull();
    expect(errorOf(3, 'description')).toBeNull();
    expect(errorOf(1, 'description')).toBeNull();
  });

  it('ignores details keys it cannot map and falls back to the alert', async () => {
    const { reject, resolve } = setup();
    fillLine(1, 'A', '1', '1');
    await save();
    await reject(serverError({ total: 'Over your credit limit', 'lines.7.quantity': 'No such line' }));
    expect(alertText()).toBe('Could not save the invoice');
    expect(errorOf(1, 'quantity')).toBeNull();
    await save();
    expect(alertText()).toBe('');
    await resolve();
  });

  it('shows the alert for a failure without details', async () => {
    const { reject } = setup();
    fillLine(1, 'A', '1', '1');
    await save();
    await reject(new Error('503'));
    expect(alertText()).toBe('Could not save the invoice');
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false);
  });
});
