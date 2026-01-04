/**
 * 统一 API 错误类
 * 
 * 用于替代分散的 { error: 'xxx' } 返回，提供一致的错误响应格式
 */

export class AppError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public code?: string
    ) {
        super(message);
        this.name = 'AppError';
    }

    // ========== 工厂方法 ==========

    static unauthorized(message = 'Unauthorized') {
        return new AppError(401, message, 'UNAUTHORIZED');
    }

    static forbidden(message = 'Forbidden') {
        return new AppError(403, message, 'FORBIDDEN');
    }

    static notFound(message = 'Not found') {
        return new AppError(404, message, 'NOT_FOUND');
    }

    static badRequest(message: string) {
        return new AppError(400, message, 'BAD_REQUEST');
    }

    static conflict(message: string) {
        return new AppError(409, message, 'CONFLICT');
    }

    static internal(message = 'Internal server error') {
        return new AppError(500, message, 'INTERNAL_ERROR');
    }
}

/**
 * 标准化错误响应格式
 */
export interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code?: string;
    };
}

/**
 * 创建标准化错误响应
 */
export function formatErrorResponse(error: unknown, code?: string): ErrorResponse {
    if (error instanceof AppError) {
        return {
            success: false,
            error: {
                message: error.message,
                code: error.code
            }
        };
    }

    const message = error instanceof Error
        ? error.message
        : (typeof error === 'string' ? error : 'Unknown error');

    return {
        success: false,
        error: {
            message,
            code: code || 'UNKNOWN'
        }
    };
}
