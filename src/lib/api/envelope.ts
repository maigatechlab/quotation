import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "FORBIDDEN"
  | "QUOTA_EXCEEDED"
  | "CONFLICT"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export function successResponse<T extends object>(data: T): T {
  return data;
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>
): ApiErrorBody {
  return errorBody(code, message, fields);
}

export function errorBody(
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>
): ApiErrorBody {
  const error: ApiErrorBody["error"] = { code, message };
  if (fields !== undefined) {
    error.fields = fields;
  }
  return { error };
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  fields?: Record<string, string>
): NextResponse<ApiErrorBody> {
  return NextResponse.json(errorBody(code, message, fields), { status });
}
