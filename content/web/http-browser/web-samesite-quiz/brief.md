`SameSite` decides whether the browser attaches a cookie to a request that
started on **another site**. It is the reason CSRF is much rarer than it used
to be, and the reason your embedded widget, your SSO callback or your
"click the link in the email" flow suddenly logs people out.

The word to get exactly right is **site**. Two URLs are the *same origin* when
scheme, host and port all match. They are the *same site* when the scheme
matches and they share a **registrable domain** — the part just above a public
suffix like `.com`, `.co.uk` or `.github.io`. So `https://app.shop.com` and
`https://api.shop.com` are **cross-origin but same-site**.

| Value | Sent on cross-site requests? |
| --- | --- |
| `Strict` | Never, not even when the user clicks a link to you. |
| `Lax` | Only on top-level navigations with a safe method (a clicked link, a typed URL). Not on cross-site `POST`, `fetch`, images or iframes. |
| `None` | Always — and the cookie must also be `Secure`. |
