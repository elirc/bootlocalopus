Most API mistakes are not bugs you can unit-test away. They are decisions —
which status code, which method, whether a change is breaking — that look fine
in review and then cost months, because once a partner depends on your API you
cannot take them back.

These questions are the design calls that come up in real review threads.
Several have more than one defensible answer in general; pick the one that is
right **for the situation described**, and read the explanations even when
you get them right.
