/**
 * Resilient API fetcher for Telegram Mini App
 * Handles content-type verification, JSON parsing safety, and retry on server boot delays.
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  balances?: any;
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {},
  retries = 2,
  delayMs = 400
): Promise<ApiResponse<T>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!isJson) {
        // If server returned HTML (e.g. 502 bad gateway or cold start) and we have retries left
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
          continue;
        }
        return {
          success: false,
          error: `Server is initializing or returned non-JSON response (${res.status})`,
        };
      }

      const json = await res.json();
      return json;
    } catch (err: unknown) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network communication error',
      };
    }
  }

  return {
    success: false,
    error: 'Failed to complete request after retries',
  };
}
