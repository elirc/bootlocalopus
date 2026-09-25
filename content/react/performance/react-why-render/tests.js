const { diffProps, useWhyRender } = solution;

describe('diffProps', () => {
  it('returns nothing for identical props', () => {
    const onClick = () => {};
    expect(diffProps({ a: 1, onClick }, { a: 1, onClick })).toEqual([]);
  });

  it('reports a changed primitive as changed', () => {
    expect(diffProps({ count: 1 }, { count: 2 })).toEqual([{ prop: 'count', reason: 'changed' }]);
  });

  it('treats NaN as equal to NaN, like memo does', () => {
    expect(diffProps({ ratio: NaN }, { ratio: NaN })).toEqual([]);
  });

  it('spots a new object with the same contents', () => {
    expect(diffProps({ style: { padding: 8 } }, { style: { padding: 8 } }))
      .toEqual([{ prop: 'style', reason: 'new-reference' }]);
    expect(diffProps({ ids: [1, 2] }, { ids: [1, 2] }))
      .toEqual([{ prop: 'ids', reason: 'new-reference' }]);
  });

  it('calls a new object with different contents changed', () => {
    expect(diffProps({ style: { padding: 8 } }, { style: { padding: 4 } }))
      .toEqual([{ prop: 'style', reason: 'changed' }]);
    expect(diffProps({ style: { padding: 8 } }, { style: { padding: 8, margin: 0 } }))
      .toEqual([{ prop: 'style', reason: 'changed' }]);
    expect(diffProps({ ids: [1, 2] }, { ids: [1, 2, 3] }))
      .toEqual([{ prop: 'ids', reason: 'changed' }]);
  });

  it('compares one level deep only', () => {
    // Same keys, but the nested object is a different reference: memo would
    // see a different value one level down too, so this is a real change.
    expect(diffProps({ user: { address: { city: 'Oslo' } } }, { user: { address: { city: 'Oslo' } } }))
      .toEqual([{ prop: 'user', reason: 'changed' }]);
  });

  it('does not confuse an empty array with an empty object', () => {
    expect(diffProps({ value: [] }, { value: {} })).toEqual([{ prop: 'value', reason: 'changed' }]);
  });

  it('reports a new function', () => {
    expect(diffProps({ onSave: () => {} }, { onSave: () => {} }))
      .toEqual([{ prop: 'onSave', reason: 'new-function' }]);
  });

  it('reports added and removed props', () => {
    expect(diffProps({ a: 1 }, { b: 1 })).toEqual([
      { prop: 'a', reason: 'removed' },
      { prop: 'b', reason: 'added' },
    ]);
  });

  it('counts a prop that becomes undefined as present', () => {
    expect(diffProps({ a: 1 }, { a: undefined })).toEqual([{ prop: 'a', reason: 'changed' }]);
    expect(diffProps({}, { a: undefined })).toEqual([{ prop: 'a', reason: 'added' }]);
  });

  it('sorts the result by prop name', () => {
    const result = diffProps({ z: 1, m: 1, a: 1 }, { z: 2, m: 2, a: 2 });
    expect(result.map((c) => c.prop)).toEqual(['a', 'm', 'z']);
  });
});

function makeProbe(reports, seen) {
  return function Probe(props) {
    useWhyRender('Probe', props, (name, changes) => {
      // Reported after commit: the DOM already shows this render.
      seen.push(document.getElementById('probe')?.textContent ?? null);
      reports.push({ name, changes });
    });
    return <span id="probe">{props.label}</span>;
  };
}

describe('useWhyRender', () => {
  it('reports nothing on mount', () => {
    const reports = [];
    const Probe = makeProbe(reports, []);
    render(<Probe label="a" />);
    expect(reports).toEqual([]);
  });

  it('reports every re-render with what changed since the last one', () => {
    const reports = [];
    const Probe = makeProbe(reports, []);
    const { rerender } = render(<Probe label="a" style={{ x: 1 }} />);
    rerender(<Probe label="b" style={{ x: 1 }} />);
    expect(reports).toEqual([{
      name: 'Probe',
      changes: [
        { prop: 'label', reason: 'changed' },
        { prop: 'style', reason: 'new-reference' },
      ],
    }]);
  });

  it('reports an empty list when a parent re-render passed identical props', () => {
    const reports = [];
    const Probe = makeProbe(reports, []);
    const { rerender } = render(<Probe label="a" />);
    rerender(<Probe label="a" />);
    rerender(<Probe label="a" />);
    expect(reports).toEqual([
      { name: 'Probe', changes: [] },
      { name: 'Probe', changes: [] },
    ]);
  });

  it('compares with the previous render, not the first one', () => {
    const reports = [];
    const Probe = makeProbe(reports, []);
    const { rerender } = render(<Probe label="a" />);
    rerender(<Probe label="b" />);
    rerender(<Probe label="b" />);
    expect(reports[1].changes).toEqual([]);
  });

  it('reports after the render has committed', () => {
    const reports = [];
    const seen = [];
    const Probe = makeProbe(reports, seen);
    const { rerender } = render(<Probe label="first" />);
    rerender(<Probe label="second" />);
    expect(seen).toEqual(['second']);
  });

  it('reports re-renders caused by the component\'s own state', () => {
    const reports = [];
    function Counter() {
      const [n, setN] = React.useState(0);
      useWhyRender('Counter', { step: 1 }, (name, changes) => reports.push({ name, changes }));
      return <button onClick={() => setN(n + 1)}>{n}</button>;
    }
    render(<Counter />);
    fireEvent.click(screen.getByRole('button'));
    // A state change with no prop change: step is a new object literal each
    // render, but its value 1 is the same, so nothing changed.
    expect(reports).toEqual([{ name: 'Counter', changes: [] }]);
  });
});
