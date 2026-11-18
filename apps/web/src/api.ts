export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  url: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch('/api' + url, {
    ...options,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal ?? AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({ error: `Server returned ${response.status}` }));
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Request failed');
  return data as T;
}
export const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export function formatTime(value: string | null | undefined, timezone = 'UTC') {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';
