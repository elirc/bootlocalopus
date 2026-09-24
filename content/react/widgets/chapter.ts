import { loadChapter } from '../../load.ts';

const here = import.meta.dirname;

export default loadChapter(here, {
  id: 'react-widgets',
  title: 'Forms & widgets',
  summary: 'User content without XSS, forms that scale past three fields, and an accessible autocomplete boss.',
  lessons: [
    {
      id: 'sec-react-xss',
      title: 'XSS in React: the escape hatches',
      kind: 'react',
      xp: 100,
      why: 'React escapes text for you, so the XSS that ships in React apps comes through `dangerouslySetInnerHTML` and `href`. Knowing exactly where is the whole defence.',
      tags: ['security', 'xss', 'urls', 'rendering'],
      hints: [
        'Allowlist, do not blocklist: `new URL(raw).protocol` is already lower-cased and stripped of the tabs and control characters attackers hide in `javascript:`. Check it against `http:`, `https:`, `mailto:` and wrap the constructor in try/catch.',
        'Split the text on `\'\\n\'` and put a `<br />` between lines; then tokenise each line on its own, so bold cannot span a newline.',
        'One regex with two alternatives handles both tokens: `/\\*\\*([^*\\n]+)\\*\\*|\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)/g`. Walk it with `line.matchAll(...)`, pushing the plain text between matches as strings.',
        'Push strings and elements into an array and render the array. Strings are escaped by React; that is the point. Give each element a key built from the line and the match index.',
        'For a link whose `safeHref(url)` is `null`, push the label string instead of an `<a>`.',
      ],
    },
    {
      id: 'react-forms-at-scale',
      title: 'Forms at scale: a useForm hook',
      kind: 'react',
      xp: 110,
      why: 'Every product has forms. Errors that appear at the right moment, are announced to screen readers and show the server\'s verdict are what separates a form people finish from one they abandon.',
      tags: ['forms', 'custom hooks', 'accessibility', 'focus management'],
      hints: [
        'Store `values`, `touched`, `serverErrors`, `submitting` and `formError`. Derive the shown errors on every render: a field shows `validate(values)[name]` if it is touched, otherwise any server error for it.',
        '"Validate on blur, then on change" falls out of that: `onBlur` marks the field touched, and once touched every render recomputes its error from the current value. A submit attempt marks every field touched.',
        'Collect the inputs with a callback `ref` per field into a `Map`. To find the first in document order, sort the invalid ones with `(a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1` and focus `[0]`.',
        '`submitting` is state, so a second submit that arrives before the next render still reads `false` from its closure. Guard with a ref as well: `if (inFlight.current) return; inFlight.current = true;` and clear it in `finally`.',
        'In the catch: keep the `error.details` entries whose key is a field; if there are any, store them as server errors and focus the first, otherwise `setFormError(error.message)`. In `onChange`, delete that field\'s server error.',
      ],
    },
    {
      id: 'react-combobox',
      title: 'BOSS: an accessible autocomplete',
      kind: 'react',
      xp: 230,
      boss: true,
      why: 'Search-as-you-type is in every product, and it is where race conditions, request storms and inaccessible widgets all meet in one component.',
      tags: ['accessibility', 'aria', 'debounce', 'abort', 'race conditions', 'keyboard'],
      hints: [
        'Keep two strings: `value` (what the input shows) and `term` (what to search for). Typing sets both; selecting sets only `value` and clears `term`, which is how picking "Apricot" avoids searching for "Apricot".',
        'One effect on `[term, debounceMs]` does all the async work: start a `setTimeout`, create an `AbortController`, and in the cleanup `clearTimeout`, `abort()`, and flip a local `let current = true` to `false`. Check `current` before setting state from a response.',
        'Hold `fetchOptions` and `onSelect` in refs updated by an effect with no dependency array, and call `fetchRef.current(query, signal)`. Then a parent re-render cannot restart the effect.',
        'Pass a rejection handler to `.then(onResults, () => {})`: an aborted request rejects, and swallowing it there is correct. The stale check already decides what may reach the screen.',
        'State for the widget: `options`, `open`, `active` (index, -1 for none), `count` (null for "announce nothing"). Derive `aria-activedescendant` as `open && active >= 0 ? optionId(active) : undefined`, with `optionId(i)` built from `useId()`.',
        'Arrow keys: `setActive((i) => (i + 1) % n)` and `setActive((i) => (i <= 0 ? n - 1 : i - 1))`; call `event.preventDefault()` so the caret does not jump. Render the `<ul role="listbox">` always, with `hidden={!open}`.',
      ],
    },
  ],
});
