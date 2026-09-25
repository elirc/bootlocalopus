export const SORT_FIELDS = ['createdAt', 'total', 'status'] as const;
export const STATUSES = ['open', 'paid', 'shipped', 'cancelled'] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type Status = (typeof STATUSES)[number];

export interface ListQuery {
  page: number;
  limit: number;
  sort: { field: SortField; direction: 'asc' | 'desc' };
  status: Status[];
  q: string | undefined;
}

export interface ParamError { param: string; message: string }

export type ParseResult =
  | { ok: true; value: ListQuery }
  | { ok: false; errors: ParamError[] };

// The version in most route handlers: every value trusted, every cast unchecked.
export function parseListQuery(input: string | URLSearchParams): ParseResult {
  const params = new URLSearchParams(input);
  const sort = params.get('sort') ?? '-createdAt';
  return {
    ok: true,
    value: {
      page: Number(params.get('page') ?? 1),
      limit: Number(params.get('limit') ?? 20),
      sort: {
        field: sort.replace('-', '') as SortField,
        direction: sort.startsWith('-') ? 'desc' : 'asc',
      },
      status: (params.get('status')?.split(',') ?? []) as Status[],
      q: params.get('q') ?? undefined,
    },
  };
}

export function toQueryString(query: ListQuery): string {
  // TODO
  return '';
}
