import { useAuth } from '../store/auth';
import { ApiError, request } from './http';

/** Authenticated request: sends the access token and, on a 401, refreshes it once and retries. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const { accessToken, refreshToken } = useAuth.getState();
  try {
    return await request<T>(path, { ...opts, token: accessToken });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || !refreshToken) throw e;
    try {
      const t = await request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
      });
      useAuth.getState().setTokens(t.accessToken, t.refreshToken);
      return await request<T>(path, { ...opts, token: t.accessToken });
    } catch (refreshError) {
      // Only a refresh the server rejects means the login is over; a slow or sleeping server is not a reason to sign out.
      if (refreshError instanceof ApiError && refreshError.status === 401) useAuth.getState().logout();
      throw e;
    }
  }
}
