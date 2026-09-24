function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** A fetchOptions whose every call returns a promise the test settles by hand. It ignores the signal. */
function makeFetch() {
  const calls = [];
  const fn = (query, signal) => {
    const d = deferred();
    calls.push({ query, signal, resolve: d.resolve, reject: d.reject });
    return d.promise;
  };
  return { fn, calls };
}

const FRUIT = [
  { id: 'apple', label: 'Apple' },
  { id: 'apricot', label: 'Apricot' },
  { id: 'avocado', label: 'Avocado' },
];

// Every test uses debounceMs={1}. `settle()` waits on a 10 ms timer that is
// scheduled *after* any debounce timer, and Node fires timers in expiry order,
// so once it resolves every earlier debounce has fired. No wall-clock guesses.
const settle = () => act(() => new Promise((r) => setTimeout(r, 10)));

function setup(extra = {}) {
  const api = makeFetch();
  const selected = [];
  const utils = render(
    <solution.Combobox label="Fruit" fetchOptions={api.fn} onSelect={(o) => selected.push(o)} debounceMs={1} {...extra} />,
  );
  const input = screen.getByRole('combobox', { name: 'Fruit' });
  return { api, selected, input, ...utils };
}

const type = (input, value) => fireEvent.change(input, { target: { value } });
const key = (input, k) => fireEvent.keyDown(input, { key: k });
const listbox = (input) => {
  const id = input.getAttribute('aria-controls');
  assert(id, 'the combobox needs aria-controls');
  const el = document.getElementById(id);
  assert(el, 'aria-controls="' + id + '" points at no element');
  return el;
};
const visibleOptions = () => screen.queryAllByRole('option').map((o) => o.textContent);
const status = () => screen.getByRole('status').textContent;

/** Type, let the debounce fire, and answer the resulting request. */
async function search(input, api, value, results) {
  type(input, value);
  await settle();
  const last = api.calls[api.calls.length - 1];
  assert(last && last.query === value, 'expected a fetchOptions call for "' + value + '", got ' + JSON.stringify(api.calls.map((c) => c.query)));
  await act(async () => { last.resolve(results); });
}

describe('structure', () => {
  it('is a labelled ARIA combobox that controls a listbox', () => {
    const { input } = setup();
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    const box = listbox(input);
    expect(box.getAttribute('role')).toBe('listbox');
    expect(box.hidden).toBe(true);
    expect(status()).toBe('');
  });
});

describe('searching', () => {
  it('debounces: a burst of typing makes one call, with the last value', async () => {
    const { api, input } = setup();
    type(input, 'a');
    type(input, 'ap');
    type(input, 'apr');
    expect(api.calls).toHaveLength(0); // nothing synchronously
    await settle();
    expect(api.calls.map((c) => c.query)).toEqual(['apr']);
    await settle();
    expect(api.calls).toHaveLength(1);
  });

  it('passes an AbortSignal', async () => {
    const { api, input } = setup();
    type(input, 'a');
    await settle();
    expect(api.calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(api.calls[0].signal.aborted).toBe(false);
  });

  it('shows the results, expands, and announces the count', async () => {
    const { api, input } = setup();
    await search(input, api, 'a', FRUIT);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(listbox(input).hidden).toBe(false);
    expect(visibleOptions()).toEqual(['Apple', 'Apricot', 'Avocado']);
    expect(status()).toBe('3 results');
    // Nothing is active until the user arrows into the list.
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('announces one result in the singular', async () => {
    const { api, input } = setup();
    await search(input, api, 'apri', [FRUIT[1]]);
    expect(status()).toBe('1 result');
  });

  it('announces no results and stays collapsed', async () => {
    const { api, input } = setup();
    await search(input, api, 'zz', []);
    expect(status()).toBe('No results');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(listbox(input).hidden).toBe(true);
  });

  it('does not search for a blank input, and clearing collapses and silences', async () => {
    const { api, input } = setup();
    await search(input, api, 'a', FRUIT);
    type(input, '   ');
    await settle();
    expect(api.calls).toHaveLength(1);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(listbox(input).hidden).toBe(true);
    expect(status()).toBe('');
  });
});

describe('races', () => {
  it('aborts the previous request when the input changes', async () => {
    const { api, input } = setup();
    type(input, 'a');
    await settle();
    type(input, 'ap');
    await settle();
    expect(api.calls.map((c) => c.query)).toEqual(['a', 'ap']);
    expect(api.calls[0].signal.aborted).toBe(true);
    expect(api.calls[1].signal.aborted).toBe(false);
  });

  it('ignores a stale response that arrives last', async () => {
    const { api, input } = setup();
    type(input, 'a');
    await settle();
    type(input, 'apr');
    await settle();
    const [first, second] = api.calls;
    await act(async () => { second.resolve([FRUIT[1]]); });
    expect(visibleOptions()).toEqual(['Apricot']);
    await act(async () => { first.resolve(FRUIT); });
    await settle();
    expect(visibleOptions()).toEqual(['Apricot']);
    expect(status()).toBe('1 result');
  });

  it('ignores a stale response that arrives first', async () => {
    const { api, input } = setup();
    type(input, 'a');
    await settle();
    type(input, 'apr');
    await settle();
    const [first, second] = api.calls;
    await act(async () => { first.resolve(FRUIT); });
    await settle();
    expect(visibleOptions()).toEqual([]);
    expect(status()).toBe('');
    await act(async () => { second.resolve([FRUIT[1]]); });
    expect(visibleOptions()).toEqual(['Apricot']);
  });

  it('survives a fetch that rejects on abort, and one that fails', async () => {
    const calls = [];
    const fetchOptions = (query, signal) => new Promise((resolve, reject) => {
      calls.push({ query, resolve, reject });
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
    render(<solution.Combobox label="Fruit" fetchOptions={fetchOptions} onSelect={() => {}} debounceMs={1} />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    type(input, 'a');
    await settle();
    type(input, 'av'); // aborts the first: its promise rejects
    await settle();
    await act(async () => { calls[1].resolve([FRUIT[2]]); });
    expect(visibleOptions()).toEqual(['Avocado']);
    type(input, 'avo');
    await settle();
    await act(async () => { calls[2].reject(new Error('503')); });
    await settle();
    // A failure changes nothing on screen.
    expect(input.value).toBe('avo');
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toBe(input);
  });

  it('aborts the request in flight on unmount', async () => {
    const { api, input, unmount } = setup();
    type(input, 'a');
    await settle();
    unmount();
    expect(api.calls[0].signal.aborted).toBe(true);
  });

  it('cancels a pending debounce on unmount', async () => {
    const api = makeFetch();
    const first = render(<solution.Combobox label="Fruit" fetchOptions={api.fn} onSelect={() => {}} debounceMs={1} />);
    type(screen.getByRole('combobox', { name: 'Fruit' }), 'apple');
    first.unmount(); // before the debounce fires
    render(<solution.Combobox label="Veg" fetchOptions={api.fn} onSelect={() => {}} debounceMs={1} />);
    type(screen.getByRole('combobox', { name: 'Veg' }), 'kale');
    await settle(); // the first timer (had it survived) expires before this one
    expect(api.calls.map((c) => c.query)).toEqual(['kale']);
  });

  it('does not restart the search when the parent re-renders with a new inline fetchOptions', async () => {
    const api = makeFetch();
    function Parent() {
      const [renders, setRenders] = React.useState(0);
      return (
        <div>
          <button onClick={() => setRenders(renders + 1)}>rerender {renders}</button>
          <solution.Combobox label="Fruit" fetchOptions={(q, s) => api.fn(q, s)} onSelect={() => {}} debounceMs={1} />
        </div>
      );
    }
    render(<Parent />);
    const input = screen.getByRole('combobox', { name: 'Fruit' });
    type(input, 'a');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));
    fireEvent.click(screen.getByRole('button', { name: /rerender/ }));
    await settle();
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].signal.aborted).toBe(false);
    await act(async () => { api.calls[0].resolve(FRUIT); });
    expect(visibleOptions()).toEqual(['Apple', 'Apricot', 'Avocado']);
  });
});

describe('keyboard', () => {
  const active = (input) => {
    const id = input.getAttribute('aria-activedescendant');
    if (id === null) return null;
    const el = document.getElementById(id);
    assert(el, 'aria-activedescendant="' + id + '" points at no element');
    assert(el.getAttribute('role') === 'option', 'aria-activedescendant must point at an option');
    assert(listbox(input).contains(el), 'the active option must be inside the controlled listbox');
    return el.textContent;
  };
  const selectedFlags = () => screen.getAllByRole('option').map((o) => o.getAttribute('aria-selected'));

  it('ArrowDown moves through the options and wraps', async () => {
    const { api, input } = setup();
    await search(input, api, 'a', FRUIT);
    key(input, 'ArrowDown');
    expect(active(input)).toBe('Apple');
    expect(selectedFlags()).toEqual(['true', 'false', 'false']);
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    expect(active(input)).toBe('Avocado');
    key(input, 'ArrowDown');
    expect(active(input)).toBe('Apple');
  });

  it('ArrowUp moves backwards and wraps; from nothing it goes to the last', async () => {
    const { api, input } = setup();
    await search(input, api, 'a', FRUIT);
    key(input, 'ArrowUp');
    expect(active(input)).toBe('Avocado');
    key(input, 'ArrowUp');
    expect(active(input)).toBe('Apricot');
    expect(selectedFlags()).toEqual(['false', 'true', 'false']);
    key(input, 'ArrowUp');
    key(input, 'ArrowUp');
    expect(active(input)).toBe('Avocado');
  });

  it('gives every option a unique id', async () => {
    const { api, input } = setup();
    await search(input, api, 'a', FRUIT);
    const ids = screen.getAllByRole('option').map((o) => o.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(3);
  });

  it('Enter selects the active option, collapses, and does not search again', async () => {
    const { api, input, selected } = setup();
    await search(input, api, 'a', FRUIT);
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(selected).toEqual([{ id: 'apricot', label: 'Apricot' }]);
    expect(input.value).toBe('Apricot');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(listbox(input).hidden).toBe(true);
    await settle();
    expect(api.calls).toHaveLength(1);
  });

  it('Enter with nothing active selects nothing', async () => {
    const { api, input, selected } = setup();
    await search(input, api, 'a', FRUIT);
    key(input, 'Enter');
    expect(selected).toEqual([]);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('Escape hides the listbox and keeps the text; ArrowDown reopens it', async () => {
    const { api, input, selected } = setup();
    await search(input, api, 'a', FRUIT);
    key(input, 'ArrowDown');
    key(input, 'Escape');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(listbox(input).hidden).toBe(true);
    expect(visibleOptions()).toEqual([]);
    expect(input.value).toBe('a');
    expect(selected).toEqual([]);
    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(active(input)).toBe('Apple');
  });

  it('typing again clears the active option', async () => {
    const { api, input } = setup();
    await search(input, api, 'a', FRUIT);
    key(input, 'ArrowDown');
    type(input, 'ap');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('clicking an option selects it', async () => {
    const { api, input, selected } = setup();
    await search(input, api, 'a', FRUIT);
    fireEvent.click(screen.getAllByRole('option')[2]);
    expect(selected).toEqual([{ id: 'avocado', label: 'Avocado' }]);
    expect(input.value).toBe('Avocado');
    expect(listbox(input).hidden).toBe(true);
  });
});
