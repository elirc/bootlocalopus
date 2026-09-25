const { Layout } = solution;

const nav = (
  <>
    <a href="/orders">Orders</a>
    <a href="/settings">Settings</a>
  </>
);

function page(routeKey, title, props = {}) {
  return (
    <Layout routeKey={routeKey} title={title} nav={nav} {...props}>
      <input aria-label="Search orders" />
    </Layout>
  );
}

const heading = () => screen.getByRole('heading', { level: 1 });
const main = () => screen.getByRole('main');
const skip = () => screen.getByRole('link', { name: 'Skip to main content' });

describe('Layout markup', () => {
  it('starts with a skip link, before the navigation', () => {
    const { container } = render(page('/orders', 'Orders'));
    const firstFocusable = container.querySelector('a[href], button, input, select, textarea, [tabindex]');
    expect(firstFocusable).toBe(skip());
    expect(skip().getAttribute('href')).toBe('#main-content');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });

  it('makes main and the heading focusable from script only', () => {
    render(page('/orders', 'Orders'));
    expect(main().id).toBe('main-content');
    expect(main().getAttribute('tabindex')).toBe('-1');
    expect(heading().getAttribute('tabindex')).toBe('-1');
    expect(heading().textContent).toBe('Orders');
    expect(main().contains(heading())).toBe(true);
  });

  it('moves focus to main from the skip link without navigating', () => {
    render(page('/orders', 'Orders'));
    skip().focus();
    const notPrevented = fireEvent.click(skip());
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(main());
  });
});

describe('Layout document title', () => {
  it('sets the title on the first render', () => {
    render(page('/orders', 'Orders'));
    expect(document.title).toBe('Orders · Acme');
  });

  it('follows the title and the site name', () => {
    const { rerender } = render(page('/orders', 'Orders'));
    rerender(page('/orders/1042', 'Order #1042', { siteName: 'Acme Admin' }));
    expect(document.title).toBe('Order #1042 · Acme Admin');
  });
});

describe('Layout focus on navigation', () => {
  it('does not move focus on the first render', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      outside.focus();
      render(page('/orders', 'Orders'));
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it('focuses the new heading when the route changes', () => {
    const { rerender } = render(page('/orders', 'Orders'));
    screen.getByRole('link', { name: 'Settings' }).focus();
    rerender(page('/settings', 'Settings'));
    expect(document.activeElement).toBe(heading());
    expect(heading().textContent).toBe('Settings');
  });

  it('focuses the heading again on every later route change', () => {
    const { rerender } = render(page('/orders', 'Orders'));
    rerender(page('/settings', 'Settings'));
    screen.getByLabelText('Search orders').focus();
    rerender(page('/orders', 'Orders'));
    expect(document.activeElement).toBe(heading());
  });

  it('leaves focus alone when the parent re-renders the same route', () => {
    const { rerender } = render(page('/orders', 'Orders'));
    rerender(page('/settings', 'Settings'));
    screen.getByLabelText('Search orders').focus();
    rerender(page('/settings', 'Settings'));
    expect(document.activeElement).toBe(screen.getByLabelText('Search orders'));
  });

  it('leaves focus alone when the title arrives later for the same route', () => {
    const { rerender } = render(page('/orders/1042', 'Order'));
    screen.getByLabelText('Search orders').focus();
    rerender(page('/orders/1042', 'Order #1042'));
    expect(document.activeElement).toBe(screen.getByLabelText('Search orders'));
    expect(document.title).toBe('Order #1042 · Acme');
  });

  it('does not steal focus on load under StrictMode', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      outside.focus();
      render(<React.StrictMode>{page('/orders', 'Orders')}</React.StrictMode>);
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});
