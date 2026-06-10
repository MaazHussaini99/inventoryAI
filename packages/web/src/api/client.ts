/**
 * API client wrapper with auth token handling.
 * Uses VITE_API_URL env variable or defaults to relative paths (proxied by Vite in dev).
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

interface ApiError {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    suggestedAction?: string;
  };
}

export class ApiClientError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  suggestedAction?: string;

  constructor(status: number, err: ApiError['error']) {
    super(err.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = err.code;
    this.retryable = err.retryable;
    this.suggestedAction = err.suggestedAction;
  }
}

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('auth_token');
}

export async function uploadFile<T>(path: string, file: File, onProgress?: (percent: number) => void): Promise<T> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new ApiClientError(xhr.status, {
            code: 'PARSE_ERROR',
            message: 'Failed to parse response',
            retryable: false,
          }));
        }
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText) as ApiError;
          reject(new ApiClientError(xhr.status, errorData.error));
        } catch {
          reject(new ApiClientError(xhr.status, {
            code: 'UNKNOWN_ERROR',
            message: `Upload failed with status ${xhr.status}`,
            retryable: false,
          }));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiClientError(0, {
        code: 'NETWORK_ERROR',
        message: 'Network error during upload',
        retryable: true,
      }));
    });

    xhr.send(formData);
  });
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorData: ApiError;
    try {
      errorData = await response.json();
    } catch {
      throw new ApiClientError(response.status, {
        code: 'UNKNOWN_ERROR',
        message: `Request failed with status ${response.status}`,
        retryable: false,
      });
    }
    throw new ApiClientError(response.status, errorData.error);
  }

  return response.json() as Promise<T>;
}
