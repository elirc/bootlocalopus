export class Emitter {
  // TODO: choose your storage. A Map of event -> array of handlers is a fine start.

  on(event, handler) {}

  once(event, handler) {}

  off(event, handler) {}

  emit(event, ...args) {}

  listenerCount(event) {}
}
