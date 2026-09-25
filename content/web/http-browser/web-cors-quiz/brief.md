"It's a CORS error" is the most common sentence in front-end support
channels, and the fix people reach for — `Access-Control-Allow-Origin: *`,
`mode: 'no-cors'`, a browser extension — is usually wrong.

Three facts explain nearly every CORS incident:

1. The **browser** enforces CORS. `curl`, Postman and your backend never do,
   which is why "it works in Postman".
2. For a *simple* request the request **is sent and processed**; CORS only
   decides whether the page may **read** the response. It is not an access
   control on your server.
3. A *non-simple* request is preceded by an `OPTIONS` **preflight**. If the
   preflight fails, the real request is never sent.

These questions are the situations you will actually debug.
