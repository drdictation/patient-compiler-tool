export type RequestOperationType = 'TRANSCRIPTION' | 'CLINICAL_GENERATION' | 'TASK_EXTRACTION';

export const TIMEOUTS = {
    TRANSCRIPTION: 30000, // 30 seconds
    CLINICAL_GENERATION: 25000, // 25 seconds
    TASK_EXTRACTION: 15000 // 15 seconds
};

export class BoundedRequestException extends Error {
    constructor(
        public readonly category: 'RETRYABLE' | 'NON_RETRYABLE',
        public readonly errorCode: string,
        message: string,
        public readonly httpStatus?: number,
        public readonly retryAfterSeconds?: number
    ) {
        super(message);
        this.name = 'BoundedRequestException';
    }
}

/**
 * Classifies an HTTP status code or Error into RETRYABLE or NON_RETRYABLE.
 */
export function classifyError(error: unknown): BoundedRequestException {
    if (error instanceof BoundedRequestException) {
        return error;
    }

    if (error instanceof Error) {
        const msg = error.name === 'AbortError' ? 'timeout' : error.message.toLowerCase();
        // Timeouts or Aborts are retryable if budget remains
        if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('abort')) {
            return new BoundedRequestException('RETRYABLE', 'TIMEOUT', error.message || 'Request timed out');
        }
        // Network connection issues
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnreset') || msg.includes('socket')) {
            return new BoundedRequestException('RETRYABLE', 'NETWORK_ERROR', error.message || 'Network error');
        }
    }

    return new BoundedRequestException('NON_RETRYABLE', 'UNKNOWN_ERROR', String(error));
}

export function classifyHttpStatus(status: number, bodyText?: string, retryAfterSeconds?: number): BoundedRequestException {
    const isRateLimit = status === 429;
    const isServerTransient = status === 500 || status === 502 || status === 503 || status === 504;

    if (isRateLimit) {
        return new BoundedRequestException('RETRYABLE', 'RATE_LIMIT', `HTTP ${status}: Rate limit exceeded`, status, retryAfterSeconds);
    }

    if (isServerTransient) {
        return new BoundedRequestException('RETRYABLE', 'SERVER_ERROR', `HTTP ${status}: Transient server error`, status, retryAfterSeconds);
    }

    // Auth errors, bad requests, payload limits, model not found
    let errorCode = 'BAD_REQUEST';
    if (status === 401 || status === 403) {
        errorCode = 'UNAUTHORIZED';
    } else if (status === 404) {
        errorCode = 'NOT_FOUND';
    } else if (status === 413) {
        errorCode = 'PAYLOAD_TOO_LARGE';
    }

    return new BoundedRequestException('NON_RETRYABLE', errorCode, `HTTP ${status}: Non-retryable error. ${bodyText || ''}`, status);
}

interface RequestWithRetryOptions {
    operation: RequestOperationType;
    url: string;
    init: RequestInit;
    requestId?: string;
    model?: string;
    provider?: string;
}

/**
 * Executes a fetch request with timeout and up to 1 retry for retryable errors.
 */
export async function fetchWithRetryAndTimeout(options: RequestWithRetryOptions): Promise<Response> {
    const maxAttempts = 2;
    const timeoutDuration = TIMEOUTS[options.operation];
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

        const attemptStartTime = Date.now();
        try {
            const elapsedTotal = Date.now() - startTime;
            if (elapsedTotal >= timeoutDuration) {
                throw new BoundedRequestException('NON_RETRYABLE', 'TIMEOUT', 'Operation timed out: total time budget exceeded.');
            }

            const response = await fetch(options.url, {
                ...options.init,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                const retryAfterHeader = response.headers ? response.headers.get('Retry-After') : null;
                let retryAfterSeconds: number | undefined;
                if (retryAfterHeader) {
                    const parsed = parseInt(retryAfterHeader, 10);
                    if (!isNaN(parsed)) {
                        retryAfterSeconds = parsed;
                    }
                }
                throw classifyHttpStatus(response.status, text, retryAfterSeconds);
            }

            const latency = Date.now() - attemptStartTime;
            console.log(JSON.stringify({
                level: 'info',
                message: 'LLM request succeeded',
                requestId: options.requestId || 'unknown',
                attempt,
                provider: options.provider || 'unknown',
                model: options.model || 'unknown',
                latencyMs: latency,
                success: true
            }));

            return response;
        } catch (err: unknown) {
            clearTimeout(timeoutId);
            const classified = classifyError(err);
            const latency = Date.now() - attemptStartTime;

            console.error(JSON.stringify({
                level: 'error',
                message: 'LLM request failed',
                requestId: options.requestId || 'unknown',
                attempt,
                provider: options.provider || 'unknown',
                model: options.model || 'unknown',
                latencyMs: latency,
                success: false,
                errorCategory: classified.category,
                errorCode: classified.errorCode,
                errorMessage: classified.message
            }));

            const elapsedTotal = Date.now() - startTime;
            const isLastAttempt = attempt === maxAttempts || classified.category === 'NON_RETRYABLE' || elapsedTotal >= timeoutDuration;

            if (isLastAttempt) {
                throw classified;
            }

            let retryAfterMs = 200 + Math.random() * 300;
            if (classified.retryAfterSeconds !== undefined) {
                const seconds = classified.retryAfterSeconds;
                if (seconds > 5) {
                    throw new BoundedRequestException('NON_RETRYABLE', 'TIMEOUT', `Retry-After value of ${seconds}s exceeds retry budget.`);
                }
                retryAfterMs = seconds * 1000;
            }

            if (elapsedTotal + retryAfterMs >= timeoutDuration) {
                throw classified;
            }

            await new Promise(resolve => setTimeout(resolve, retryAfterMs));
        }
    }

    throw new BoundedRequestException('NON_RETRYABLE', 'UNKNOWN_ERROR', 'Request execution failed to return a response.');
}
