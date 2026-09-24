const todos = [
  { id: 'a', title: 'Buy milk' },
  { id: 'b', title: 'Write tests' },
  { id: 'c', title: 'Ship it' },
];

describe('TodoEditor', () => {
  it('renders an input per todo', () => {
    render(<solution.TodoEditor todos={todos} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByLabelText('Write tests')).toBeTruthy();
  });

  it('deletes the right row', () => {
    render(<solution.TodoEditor todos={todos} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Write tests' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByLabelText('Write tests')).toBeNull();
    expect(screen.getByLabelText('Buy milk')).toBeTruthy();
    expect(screen.getByLabelText('Ship it')).toBeTruthy();
  });

  it('keeps typed text with its own row when an earlier row is deleted', () => {
    render(<solution.TodoEditor todos={todos} />);
    fireEvent.change(screen.getByLabelText('Write tests'), { target: { value: 'unit + integration' } });
    fireEvent.change(screen.getByLabelText('Ship it'), { target: { value: 'friday' } });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Buy milk' }));

    // With index keys the values shift up by one row; with stable keys they follow their todo.
    expect(screen.getByLabelText('Write tests').value).toBe('unit + integration');
    expect(screen.getByLabelText('Ship it').value).toBe('friday');
  });

  it('keeps focus on the right row after a deletion', () => {
    render(<solution.TodoEditor todos={todos} />);
    const shipIt = screen.getByLabelText('Ship it');
    shipIt.focus();
    expect(document.activeElement).toBe(shipIt);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Buy milk' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Ship it'));
  });

  it('survives deleting from the middle', () => {
    render(<solution.TodoEditor todos={todos} />);
    fireEvent.change(screen.getByLabelText('Ship it'), { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Write tests' }));
    expect(screen.getByLabelText('Ship it').value).toBe('keep me');
  });
});