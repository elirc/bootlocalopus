Component tests go wrong in predictable ways. Some query the DOM by class
name and break on every redesign. Some assert right after a click, before
React has rendered. Some pass because `getBy…` found **a** match, not
**the** one they meant. And some test a mock of the hook instead of the
component.

Testing Library's main rule is: *the more your tests resemble the way your
software is used, the more confidence they can give you.* These questions
are the everyday calls that follow from it. Which query do you use? When do
you need `act` or `findBy`? What should you mock?
