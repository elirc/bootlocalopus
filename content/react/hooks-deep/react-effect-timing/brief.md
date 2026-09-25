Most effect bugs are timing bugs: a tooltip that flickers in the wrong place
for one frame, a socket opened twice in development, a subscription that
briefly listens to the old user. You fix them faster once you know exactly
when React runs what.

**One commit, in order:**

1. **Render.** React calls your components. Pure: no DOM yet, may be repeated
   or thrown away.
2. **Commit.** React applies the changes to the DOM and attaches refs.
3. **Layout effects** (`useLayoutEffect`) run synchronously, children before
   parents, **before the browser paints**. Reading layout and setting state
   here re-renders before the user sees anything.
4. The browser **paints**.
5. **Passive effects** (`useEffect`) run, children before parents, after
   paint (React may flush them earlier if another update needs them).

**Cleanups.** When an effect's dependencies change, React runs the previous
cleanup, with the previous render's values, and then the new effect. On
unmount it runs the cleanup alone.

**StrictMode in development** mounts every component, runs its effects,
simulates an unmount (running every cleanup), and mounts it again. An effect
whose cleanup does not undo its setup shows up as a duplicate: two sockets,
two listeners, two analytics events.

**Server rendering** runs no effects at all: `useLayoutEffect` does nothing
on the server, and React 18 warns about it.

Answer the questions below. Every one describes a situation you will meet in
a real codebase.
