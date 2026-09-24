import { Component } from 'react';

export class ErrorBoundary extends Component {
  // TODO: catch render errors from the children, show fallbackRender({ error, reset }),
  // report with onError, and reset on reset() or a resetKeys change.
  render() {
    return this.props.children;
  }
}
