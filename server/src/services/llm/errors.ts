/**
 * LLM 错误处理
 * 
 * 提供 safeLLMCall 包装器，分类处理超时/连接/上游错误。
 */

import { APIConnectionTimeoutError, APIConnectionError, APIError } from 'openai';

/**
 * 安全调用 LLM API，带详细错误分类和计时
 */
export async function safeLLMCall<T>(
    operationName: string,
    call: () => Promise<T>
): Promise<T> {
    const callStartTime = Date.now();
    const callStartISO = new Date().toISOString();
    try {
        return await call();
    } catch (e) {
        const elapsedMs = Date.now() - callStartTime;
        const elapsedMinutes = (elapsedMs / 1000 / 60).toFixed(2);
        if (e instanceof APIConnectionTimeoutError) {
            console.error(`[${operationName}] Client Timeout after ${elapsedMinutes} min (started: ${callStartISO}):`, e);
            throw new Error(`Client Timeout: ${operationName} timed out after ${elapsedMinutes} minutes (started: ${callStartISO}).`);
        }
        if (e instanceof APIConnectionError) {
            console.error(`[${operationName}] Connection Error:`, e);
            throw new Error(`Connection Error: Failed to connect to upstream LLM provider. (Network/DNS)`);
        }
        if (e instanceof APIError) {
            const status = e.status;
            console.error(`[${operationName}] Upstream API Error (${status}):`, e);
            if (status === 408) throw new Error(`Upstream Timeout: Server returned 408 Request Timeout.`);
            if (status === 504) throw new Error(`Upstream Timeout: Server returned 504 Gateway Timeout.`);
            if (status === 502) throw new Error(`Upstream Error: Server returned 502 Bad Gateway.`);
            if (status === 500) throw new Error(`Upstream Error: Server Internal Error (500).`);
            throw new Error(`Upstream API Error: ${status} - ${e.message}`);
        }
        console.error(`[${operationName}] Unknown Error:`, e);
        throw e;
    }
}
