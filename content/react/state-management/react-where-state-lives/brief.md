Most "we need a state management library" conversations are really "we put
this state in the wrong place". Before choosing a tool, sort each piece of
state by what it **is**:

| Kind | Examples | Where it lives |
| --- | --- | --- |
| **Derived** | a total, a filtered list, "is the form valid" | nowhere: compute it during render |
| **Server cache** | the user's orders, a product page | a query cache, keyed by request (not `useState` + `useEffect` copies) |
| **URL** | filters, sort, page, selected tab, open item | the query string or path, so it survives refresh, Back and sharing |
| **Local UI** | is this dropdown open, the text in this input | `useState` in the lowest component that needs it |
| **Shared client** | the cart, the current theme, a multi-step form's draft | lifted to the nearest common parent, or context/a store when that parent is far away |

Two rules settle most arguments:

1. **Colocate.** State starts in the component that uses it and moves up only
   when a second component needs it. State kept higher than necessary
   re-renders more than necessary and couples components that did not need
   to know about each other.
2. **One source of truth.** Never keep two copies of the same fact (a prop
   copied into state, a server response copied into a global store) and try
   to keep them in sync. Derive one from the other.

Answer the questions below.
