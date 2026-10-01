import { API_URL } from '../config';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, typeof data?.error === 'string' ? data.error : 'Something went wrong');
  }
  return data as T;
}

/** Audio and images are stored either as absolute URLs or as paths under the API's /media. */
export function mediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http') ? url : `${API_URL}${url}`;
}
