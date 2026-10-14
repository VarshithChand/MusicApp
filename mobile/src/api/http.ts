import { API_URL } from '../config';
import { useNetwork } from '../store/network';

export class ApiError extends Error {
  /** `reason` is the server's machine-readable code, where it sends one (e.g. YouTube's "quotaExceeded"). */
  constructor(public status: number, message: string, public reason: string | null = null) {
    super(message);
  }
}

/**
 * What to tell the viewer when a video list fails. The server explains the cases it knows about
 * (mainly the daily YouTube allowance), and retrying those doesn't help, so don't invite it.
 */
export function videoErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 502 && error.message) return error.message;
  return "Couldn't load videos. Try again in a moment.";
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    // fetch only rejects when the request never reached the server, which is what being offline looks like.
    useNetwork.getState().setOffline(true);
    throw e;
  }
  useNetwork.getState().setOffline(false);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof data?.error === 'string' ? data.error : 'Something went wrong',
      typeof data?.reason === 'string' ? data.reason : null,
    );
  }
  return data as T;
}

/** Audio and images are stored either as absolute URLs or as paths under the API's /media. */
export function mediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return /^(https?|content|file):/.test(url) ? url : `${API_URL}${url}`;
}
