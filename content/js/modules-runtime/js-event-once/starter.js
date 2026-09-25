export function once(target, eventName, { signal, filter } = {}) {
  // TODO: support EventTarget and on/off emitters, reject on emitter 'error',
  // honour filter and signal, and remove every listener you add.
  return Promise.reject(new Error('once: not implemented'));
}
