import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';

/**
 * The one class component in the app. A render-time throw anywhere below
 * would otherwise unmount everything and leave a blank page with no way back.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading" role="alert">
        <p>
          <strong>Something broke in the interface.</strong>
        </p>
        <p className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>
          {this.state.error.message}
        </p>
        <p>
          <a href="#/" className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </a>
        </p>
        <p className="faint" style={{ fontSize: 12.5 }}>
          Your progress is safe — it lives on the server, not in this page.
        </p>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
