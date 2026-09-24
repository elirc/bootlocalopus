export interface User {
  id: number;
  name: string;
}

export interface Routes {
  '/users': { method: 'GET'; response: User[] };
  '/users/:id': { method: 'GET'; response: User };
  '/users/create': { method: 'POST'; body: { name: string }; response: User };
  '/sessions': { method: 'POST'; body: { email: string; password: string }; response: { token: string } };
}

export type Endpoint = string;              // TODO
export type ResponseOf<E> = unknown;        // TODO
export type BodyOf<E> = unknown;            // TODO
export type GetEndpoint = string;           // TODO
export type PostEndpoint = string;          // TODO

export interface ApiClient {
  // TODO
}
