Unit tests fail in two expensive ways. Some pass while the code is wrong,
because they assert too little or assert the implementation back at itself.
Others fail while the code is right, because they pin details that no user
depends on. Both come from small design decisions: where the expected
value comes from, what gets mocked, what a test is named, and what "one
test" covers.

These questions are the judgement calls a reviewer makes on a unit-test pull
request. For each one, ask two things: what would this test **catch**, and
what would make it **fail for no reason**?
