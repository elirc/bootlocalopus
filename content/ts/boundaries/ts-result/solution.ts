export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });

export function attempt(fn) {
  try {
    return ok(fn());
  } catch (error) {
    return err(error);
  }
}

export async function attemptAsync(fn) {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error);
  }
}

export function map(result, fn) {
  // A throw inside fn is the caller's problem; wrap with attempt to capture it.
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapError(result, fn) {
  return result.ok ? result : err(fn(result.error));
}

export function unwrapOr(result, fallback) {
  return result.ok ? result.value : fallback;
}

export function unwrap(result) {
  if (result.ok) return result.value;
  throw result.error;
}

export function all(results) {
  const values = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}
