import type {ErrorResponse} from './model';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function responseError(response: Response): Promise<ApiError> {
  const body: Partial<ErrorResponse> | null = await response.json().catch(() => null);
  return new ApiError(response.status, body?.error?.code ?? '', body?.error?.message ?? response.statusText, body?.request_id ?? null);
}
