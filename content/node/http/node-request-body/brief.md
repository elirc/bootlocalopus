A request body is a stream. Concatenating it without a limit means one
client can exhaust your memory. Parsing it without a try/catch means one
malformed payload takes down the handler.

## Task

Export `readJson(req, { limit = 1024 } = {})`, an async function that:

- rejects immediately with `status: 413` if a `content-length` header already
  declares more than `limit` bytes — without reading the body at all
- otherwise collects the body, and still rejects with `413` if the actual bytes
  exceed `limit`, stopping as soon as it knows rather than buffering the rest
- rejects with `status` `400` for invalid JSON
- rejects with `status` `400` if the parsed value is not an object
- returns `{}` for a completely empty body

Then export `createServer()`: `POST /echo` responds `200` with
`{ received: <body> }`, or the error's status and `{ error: <message> }`.