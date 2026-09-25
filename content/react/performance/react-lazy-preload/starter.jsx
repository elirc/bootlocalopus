import { Component, Suspense, lazy, useState } from 'react';

export function lazyWithPreload(factory, { retries = 1 } = {}) {
  // TODO: share one load between preload() and React.lazy, and retry a
  // failed load up to `retries` more times.
  const LazyComponent = lazy(factory);
  LazyComponent.preload = () => Promise.reject(new Error('preload is not implemented'));
  return LazyComponent;
}

class PageErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <p role="alert">Could not load {this.props.name}</p>;
    return this.props.children;
  }
}

export function PageSwitcher({ pages }) {
  const [current, setCurrent] = useState(pages[0].name);
  const page = pages.find((p) => p.name === current);
  const Page = page.Component;

  // TODO: preload a page on hover and on keyboard focus.
  return (
    <div>
      <nav aria-label="Pages">
        {pages.map((p) => (
          <button
            key={p.name}
            type="button"
            aria-current={p.name === current ? 'page' : undefined}
            onClick={() => setCurrent(p.name)}
          >
            {p.name}
          </button>
        ))}
      </nav>
      <main>
        <PageErrorBoundary name={page.name}>
          <Suspense fallback={<p>Loading…</p>}>
            <Page />
          </Suspense>
        </PageErrorBoundary>
      </main>
    </div>
  );
}
