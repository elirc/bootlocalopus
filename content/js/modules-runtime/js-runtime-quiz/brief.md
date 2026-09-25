The runtime has opinions your code does not see until production: how
values are copied between contexts, which timers keep a process alive, what
happens to a promise nobody is listening to yet, and which clock is allowed
to jump.

None of these are exotic. Each question below is a bug that has shipped in
ordinary service code: a token refresh that fires immediately, a CLI that
never exits, a server that crashes on a rejection that *was* going to be
handled, and a cache that grows until the pod is killed.
