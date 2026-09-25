const { CheckoutWizard } = solution;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const field = (label) => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
const heading = () => screen.getByRole('heading', { level: 2 });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const next = () => fireEvent.submit(heading().closest('form'));
const errorFor = (label) => {
  const input = field(label);
  const id = input.getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent ?? null : null;
};
const currentStep = () => within(screen.getByRole('list', { name: 'Progress' }))
  .getAllByRole('listitem')
  .filter((li) => li.getAttribute('aria-current') === 'step')
  .map((li) => li.textContent);

function setup(onSubmit = () => Promise.resolve()) {
  const orders = [];
  render(<CheckoutWizard onSubmit={(order) => { orders.push(order); return onSubmit(order); }} />);
  return orders;
}

function toReview() {
  type('Email', ' ada@example.com ');
  next();
  type('Address', '12 Analytical Row');
  type('City', ' London');
  next();
}

describe('CheckoutWizard steps', () => {
  it('starts on Contact, marked as the current step', () => {
    setup();
    expect(heading().textContent).toBe('Step 1 of 3: Contact');
    expect(currentStep()).toEqual(['Contact']);
    expect(field('Email').value).toBe('');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('does not move focus on the first render', () => {
    setup();
    expect(document.activeElement).not.toBe(heading());
  });

  it('moves to Shipping on a valid Next and focuses the new heading', () => {
    setup();
    type('Email', 'ada@example.com');
    next();
    expect(heading().textContent).toBe('Step 2 of 3: Shipping');
    expect(currentStep()).toEqual(['Shipping']);
    expect(document.activeElement).toBe(heading());
    expect(heading().getAttribute('tabindex')).toBe('-1');
  });

  it('validates only the current step', () => {
    setup();
    type('Email', 'ada@example.com');
    next();
    // Address and City are empty, but they belong to step 2.
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(field('Address')).toBeTruthy();
  });

  it('keeps every value when going back and forward', () => {
    setup();
    type('Email', 'ada@example.com');
    next();
    type('Address', '12 Analytical Row');
    click('Back');
    expect(heading().textContent).toBe('Step 1 of 3: Contact');
    expect(field('Email').value).toBe('ada@example.com');
    expect(document.activeElement).toBe(heading());
    next();
    expect(field('Address').value).toBe('12 Analytical Row');
  });

  it('does not validate when going back', () => {
    setup();
    type('Email', 'ada@example.com');
    next();
    click('Back');
    expect(heading().textContent).toBe('Step 1 of 3: Contact');
  });
});

describe('CheckoutWizard validation', () => {
  it('stays on the step, explains the problem and focuses the field', () => {
    setup();
    type('Email', 'ada at example.com');
    next();
    expect(heading().textContent).toBe('Step 1 of 3: Contact');
    expect(errorFor('Email')).toBe('Enter a valid email');
    expect(field('Email').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field('Email'));
  });

  it('checks trimmed values', () => {
    setup();
    type('Email', '   ');
    next();
    expect(errorFor('Email')).toBe('Enter a valid email');
    type('Email', 'ada@example.com');
    next();
    type('Address', '   ');
    type('City', 'London');
    next();
    expect(errorFor('Address')).toBe('Enter an address');
    expect(errorFor('City')).toBeNull();
  });

  it('focuses the first invalid field in the step', () => {
    setup();
    type('Email', 'ada@example.com');
    next();
    type('Address', '12 Analytical Row');
    next();
    expect(errorFor('City')).toBe('Enter a city');
    expect(document.activeElement).toBe(field('City'));
    type('Address', '');
    type('City', '');
    next();
    expect(errorFor('Address')).toBe('Enter an address');
    expect(errorFor('City')).toBe('Enter a city');
    expect(document.activeElement).toBe(field('Address'));
  });

  it('removes a field\'s error when it is edited', () => {
    setup();
    type('Email', 'nope');
    next();
    type('Email', 'nope@');
    expect(errorFor('Email')).toBeNull();
    expect(field('Email').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('CheckoutWizard review and submit', () => {
  it('shows the trimmed values for review', () => {
    setup();
    toReview();
    expect(heading().textContent).toBe('Step 3 of 3: Review');
    const text = heading().closest('form').textContent;
    expect(text).toContain('ada@example.com');
    expect(text).toContain('12 Analytical Row');
    expect(text).toContain('London');
    expect(text).not.toContain(' London');
  });

  it('jumps back to a step from the review, keeping values', () => {
    setup();
    toReview();
    click('Edit contact');
    expect(heading().textContent).toBe('Step 1 of 3: Contact');
    expect(field('Email').value).toBe(' ada@example.com ');
    expect(document.activeElement).toBe(heading());
    next();
    next();
    click('Edit shipping');
    expect(field('City').value).toBe(' London');
  });

  it('places the order once, with trimmed values', async () => {
    const d = deferred();
    const orders = setup(() => d.promise);
    toReview();
    await act(async () => { next(); });
    expect(screen.getByRole('button', { name: 'Place order' }).disabled).toBe(true);
    await act(async () => { next(); });
    await act(async () => { d.resolve(); });
    expect(orders).toStrictEqual([{ email: 'ada@example.com', address: '12 Analytical Row', city: 'London' }]);
    expect(screen.getByRole('button', { name: 'Place order' }).disabled).toBe(false);
  });

  it('stays on the review with an alert when placing fails', async () => {
    const d = deferred();
    const orders = setup(() => d.promise);
    toReview();
    await act(async () => { next(); });
    await act(async () => { d.reject(new Error('500')); });
    expect(screen.getByRole('alert').textContent).toBe('Could not place the order. Try again.');
    expect(heading().textContent).toBe('Step 3 of 3: Review');
    expect(screen.getByRole('button', { name: 'Place order' }).disabled).toBe(false);
    expect(orders).toHaveLength(1);
  });
});
