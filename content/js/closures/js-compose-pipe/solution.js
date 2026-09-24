export function pipe(...fns) {
  return (...args) => {
    if (fns.length === 0) return args[0];
    return fns.slice(1).reduce((acc, fn) => fn(acc), fns[0](...args));
  };
}

export function compose(...fns) {
  return pipe(...[...fns].reverse());
}

export function pipeAsync(...fns) {
  return async (...args) => {
    if (fns.length === 0) return args[0];
    let value = await fns[0](...args);
    for (const fn of fns.slice(1)) value = await fn(value);
    return value;
  };
}
