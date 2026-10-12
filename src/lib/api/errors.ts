export type ApiErrorBody = { code: string; message: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
  }
  get code() { return this.body.code; }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.body.message;
  if (e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return "Đã xảy ra lỗi.";
}
