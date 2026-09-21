export type GeminiErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'SAFETY_BLOCKED'
  | 'UNKNOWN_ERROR';

export class GeminiApiError extends Error {
  public readonly code: GeminiErrorCode;
  public readonly httpStatus?: number;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: GeminiErrorCode = 'UNKNOWN_ERROR',
    httpStatus?: number,
    isRetryable = false
  ) {
    super(message);
    this.name = 'GeminiApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.isRetryable = isRetryable;
  }

  public static fromHttpResponse(status: number, errorData?: { error?: { message?: string; status?: string } }): GeminiApiError {
    const rawMsg = errorData?.error?.message || '';

    if (status === 400) {
      if (rawMsg.toLowerCase().includes('api_key_invalid') || rawMsg.toLowerCase().includes('key not valid')) {
        return new GeminiApiError('Your Gemini API key is invalid. Please verify it in settings.', 'INVALID_API_KEY', 400, false);
      }
      return new GeminiApiError(`Gemini request failed: ${rawMsg || 'Bad request'}`, 'MALFORMED_RESPONSE', 400, false);
    }

    if (status === 401 || status === 403) {
      return new GeminiApiError('Gemini API key is unauthorized or lacks permission.', 'INVALID_API_KEY', status, false);
    }

    if (status === 429) {
      return new GeminiApiError('Gemini API rate limit exceeded. Please wait a moment and try again.', 'RATE_LIMIT_EXCEEDED', 429, true);
    }

    if (status === 503 || status === 500) {
      return new GeminiApiError('Gemini service is temporarily unavailable. Please retry shortly.', 'UNKNOWN_ERROR', status, true);
    }

    return new GeminiApiError(`Gemini API error (${status}): ${rawMsg || 'Unexpected error'}`, 'UNKNOWN_ERROR', status, false);
  }
}
