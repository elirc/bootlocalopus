`<Tabs items={...} renderTab={...} activeIndex={...} onTabChange={...} />`
is a component that will grow forever. Compound components invert it: the
parent owns state, the children read it from context, and the consumer controls
the markup.

## Task

Export `Tabs` with three attached components:

```jsx
<Tabs defaultValue="a">
  <Tabs.List>
    <Tabs.Tab value="a">First</Tabs.Tab>
    <Tabs.Tab value="b">Second</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel value="a">First panel</Tabs.Panel>
  <Tabs.Panel value="b">Second panel</Tabs.Panel>
</Tabs>
```

Requirements:

- `Tabs.List` renders a `<div role="tablist">`
- `Tabs.Tab` renders a `<button role="tab">` with
  `aria-selected` true/false, and selects itself on click
- `Tabs.Panel` renders its children in a `<div role="tabpanel">` **only** when
  it is the active tab
- rendering any of the three outside a `Tabs` throws an error whose message
  contains `must be used inside <Tabs>`

This lesson is about the *component API*, not a fully conformant widget. A
production tab set also follows the ARIA Authoring Practices: arrow keys move
between tabs, only the active tab is in the Tab order (`tabIndex={-1}` on the
rest), and each tab points at its panel with `aria-controls`. That is the
next step once the context plumbing is solid.
