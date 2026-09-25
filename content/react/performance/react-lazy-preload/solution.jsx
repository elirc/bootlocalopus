import { Component, Suspense, lazy, useState } from 'react';

export function lazyWithPreload(factory, { retries = 1 } = {}) {
  // One promise per component, shared by preload() and React.lazy, so the
  // chunk is requested once however many times it is hovered or rendered.
  let loading = null;

  const attempt = (left) =>
    factory().catch((error) => (left > 0 ? attempt(left - 1) : Promise.reject(error)));

  const load = () => {
    // React.lazy remembers a rejection for good, so retrying must happen
    // here, inside the promise it is given, not by rendering again.
    if (!loading) loading = attempt(retries);
    return loading;
  };

  const LazyComponent = lazy(load);
  LazyComponent.preload = load;
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

  // Warm the chunk as soon as intent is likely. A failure here is not the
  // user's problem yet: swallow it, and let the render report it if they
  // actually open the page.
  const warm = (target) => {
    target.Component.preload().catch(() => {});
  };

  return (
    <div>
      <nav aria-label="Pages">
        {pages.map((p) => (
          <button
            key={p.name}
            type="button"
            aria-current={p.name === current ? 'page' : undefined}
            onMouseEnter={() => warm(p)}
            onFocus={() => warm(p)}
            onClick={() => setCurrent(p.name)}
          >
            {p.name}
          </button>
        ))}
      </nav>
      <main>
        {/* Keyed so a failed page does not leave the boundary stuck in its
            error state when the user moves to another page. */}
        <PageErrorBoundary key={page.name} name={page.name}>
          <Suspense fallback={<p>Loading…</p>}>
            <Page />
          </Suspense>
        </PageErrorBoundary>
      </main>
    </div>
  );
}
