import { Component } from 'react';

// `didCatch` rather than `error !== null`: JavaScript can throw anything,
// including `null` or `undefined`, and that must still show the fallback.
const initialState = { didCatch: false, error: null };

/** True when two resetKeys arrays differ in length or in any element (Object.is). */
function changed(a = [], b = []) {
  return a.length !== b.length || a.some((item, index) => !Object.is(item, b[index]));
}

export class ErrorBoundary extends Component {
  state = initialState;

  // Render phase: turn the thrown value into state so the next render shows
  // the fallback. Must be pure, so no reporting here.
  static getDerivedStateFromError(error) {
    return { didCatch: true, error };
  }

  // Commit phase: the right place for side effects such as reporting.
  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps, prevState) {
    // `prevState.didCatch` matters: if the update that changed the keys is
    // also the one that threw, resetting now would loop straight back into
    // the broken child. Only reset an error that was already on screen.
    if (this.state.didCatch && prevState.didCatch && changed(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  // An arrow property, so the fallback can call it unbound.
  reset = () => {
    this.setState(initialState);
  };

  render() {
    if (this.state.didCatch) {
      // The children were unmounted when the error was caught, so clearing the
      // error mounts them again from scratch.
      return this.props.fallbackRender({ error: this.state.error, reset: this.reset });
    }
    return this.props.children;
  }
}
