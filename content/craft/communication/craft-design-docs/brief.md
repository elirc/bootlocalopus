The feature took six weeks instead of two. Not because the code was hard,
but because in week three a staff engineer saw the PR and asked why it
wasn't using the existing event bus, in week four product said the email
digest was never in scope, and in week five security asked where the
personal data was stored. Every one of those questions would have taken ten
minutes to answer **before** anyone wrote code.

That is what a design doc is for: it moves the expensive conversations to
the cheapest point, and it leaves a record of *why* the system is the way it
is. It is not a specification to be approved and filed. A good one is short,
opinionated, honest about what it does not know, and read by the right
three people.

The questions below are about when to write one, what goes in it, and how
to run it. Some have more than one correct answer.
