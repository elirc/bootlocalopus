export class Emitter {
  #events = new Map();

  on(event, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const list = this.#events.get(event) ?? [];
    list.push(handler);
    this.#events.set(event, list);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    wrapper.original = handler;
    return this.on(event, wrapper);
  }

  off(event, handler) {
    const list = this.#events.get(event);
    if (!list) return this;
    const i = list.findIndex((h) => h === handler || h.original === handler);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) this.#events.delete(event);
    return this;
  }

  emit(event, ...args) {
    const list = this.#events.get(event);
    if (!list || list.length === 0) return 0;
    // Snapshot: handlers may subscribe or unsubscribe while we deliver.
    const snapshot = [...list];
    const errors = [];
    for (const handler of snapshot) {
      try {
        handler(...args);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, 'one or more handlers for "' + event + '" threw');
    }
    return snapshot.length;
  }

  listenerCount(event) {
    return this.#events.get(event)?.length ?? 0;
  }
}
