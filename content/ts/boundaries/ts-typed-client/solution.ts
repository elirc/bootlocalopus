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

export type Endpoint = keyof Routes;

export type ResponseOf<E extends Endpoint> = Routes[E]['response'];

export type BodyOf<E extends Endpoint> = Routes[E] extends { body: infer B } ? B : never;

export type GetEndpoint = {
  [K in Endpoint]: Routes[K]['method'] extends 'GET' ? K : never;
}[Endpoint];

export type PostEndpoint = {
  [K in Endpoint]: Routes[K]['method'] extends 'POST' ? K : never;
}[Endpoint];

export interface ApiClient {
  get<E extends GetEndpoint>(endpoint: E): Promise<ResponseOf<E>>;
  post<E extends PostEndpoint>(endpoint: E, body: BodyOf<E>): Promise<ResponseOf<E>>;
}
