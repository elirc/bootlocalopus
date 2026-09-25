// Find fields by label, the way a user does. No jest-dom: assert on the DOM directly.

const email = () => screen.getByLabelText('Email');
const password = () => screen.getByLabelText('Password');
const terms = () => screen.getByLabelText('I accept the terms');
const submitButton = () => screen.getByRole('button');

describe('SignupForm', () => {
  it('shows an error for a bad email', () => {
    render(<solution.SignupForm onSubmit={() => {}} />);
    fireEvent.change(email(), { target: { value: 'nope' } });
    fireEvent.click(submitButton());
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
  });

  // TODO: focus, aria-invalid and aria-describedby, the password boundary,
  // the trimmed payload, one submit while pending, and errors clearing as you type.
});
