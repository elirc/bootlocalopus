Typing a client route by route is busywork that rots. Instead declare a
route map once and derive everything from it.

## Task

Given the `Routes` map in the starter, export:

- `Endpoint` — the union of route keys
- `ResponseOf<E>` — the response type for an endpoint
- `BodyOf<E>` — the request body type, or `never` if the route has none
- `ApiClient` — an interface with:
  - `get<E extends GetEndpoint>(endpoint: E): Promise<ResponseOf<E>>`
  - `post<E extends PostEndpoint>(endpoint: E, body: BodyOf<E>): Promise<ResponseOf<E>>`
- `GetEndpoint` / `PostEndpoint` — endpoints filtered by method

The spec proves that calling `get('/users')` gives `User[]`, that posting the
wrong body shape fails, and that a GET route cannot be posted to.