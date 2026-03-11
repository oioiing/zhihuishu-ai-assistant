// ==========================================
// 智能重试管理器 - 指数退避 + 智能分类
// ==========================================

class RetryManager {
    constructor(options = {}) {
        this.maxAttempts = options.maxAttempts || 3;
        this.initialDelay = options.initialDelay || 1000;
        this.maxDelay = options.maxDelay || 30000;
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.timeout = options.timeout || 30000;

        // 定义可重试的错误类型
        this.retryablePatterns = [
            /timeout/i,
            /ECONNREFUSED/,
            /ECONNRESET/,
            /ERR_CONNECTION_RESET/,
            /ERR_CONNECTION_REFUSED/,
            /ERR_NAME_NOT_RESOLVED/,
            /无法访问/,
            /网络错误/,
            /连接被拒绝/,
            /503/, // Service Unavailable
            /429/, // Too Many Requests
            /500/, // Internal Server Error
        ];

        // 不可重试的错误类型
        this.nonRetryablePatterns = [
            /API Key/i,
            /401/,  // Unauthorized
            /403/,  // Forbidden
            /404/,  // Not Found
            /权限不足/,
            /无效的/,
            /参数错误/,
        ];
    }

    /**
     * 执行异步函数，支持自动重试
     * @param asyncFn 异步函数
     * @param context 上下文信息
     * @returns 函数执行结果
     */
    async execute(asyncFn, context = {}) {
        const { name = '操作', onRetry = null } = context;
        let lastError;
        let delay = this.initialDelay;

        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            try {
                logManager?.debug('[重试]', `📍 第 ${attempt}/${this.maxAttempts} 次尝试: ${name}`);

                // 包装函数添加超时保护
                const result = await this._executeWithTimeout(asyncFn, this.timeout);
                
                if (attempt > 1) {
                    logManager?.success('[重试]', `✅ ${name} 成功（第${attempt}次尝试）`);
                }

                return result;
            } catch (error) {
                lastError = error;
                const isRetryable = this.isRetryable(error);
                const isLastAttempt = attempt === this.maxAttempts;

                // 记录失败
                if (isLastAttempt) {
                    logManager?.error('[重试]', 
                        `❌ ${name} 最终失败（${this.maxAttempts}次尝试后）: ${error.message}`);
                } else {
                    logManager?.warn('[重试]', 
                        `⚠️  ${name} 第${attempt}次失败: ${error.message} (可重试: ${isRetryable ? '✅' : '❌'})`);
                }

                // 如果不可重试或已是最后一次，直接抛出错误
                if (!isRetryable || isLastAttempt) {
                    throw error;
                }

                // 计算退避延迟
                const actualDelay = Math.min(delay, this.maxDelay);
                
                // 添加随机抖动（±20%）以避免惊群效应
                const jitter = actualDelay * 0.2 * (Math.random() - 0.5);
                const finalDelay = Math.max(100, actualDelay + jitter);

                logManager?.info('[重试]', 
                    `⏳ 等待 ${Math.round(finalDelay)}ms 后重试...`);

                // 调用重试回调
                if (onRetry) {
                    onRetry({ attempt, delay: finalDelay, reason: error.message });
                }

                // 等待后重试
                await this._sleep(finalDelay);

                // 增加下次延迟
                delay *= this.backoffMultiplier;
            }
        }

        throw lastError;
    }

    /**
     * 执行多个异步函数，支持并发控制和重试
     */
    async executeBatch(asyncFns, context = {}) {
        const { maxConcurrent = 3, name = '批量操作' } = context;
        const results = [];
        const activeTasks = new Set();
        let completed = 0;

        for (const asyncFn of asyncFns) {
            const task = this.execute(asyncFn, { name })
                .then(result => {
                    completed++;
                    logManager?.debug('[批处理]', `进度: ${completed}/${asyncFns.length}`);
                    return result;
                })
                .catch(error => {
                    completed++;
                    logManager?.warn('[批处理]', `任务失败: ${error.message}`);
                    return { error, success: false };
                })
                .finally(() => {
                    activeTasks.delete(task);
                });

            results.push(task);
            activeTasks.add(task);

            if (activeTasks.size >= maxConcurrent) {
                await Promise.race(activeTasks);
            }
        }

        const finalResults = await Promise.all(results);
        const successful = finalResults.filter(r => !r.error).length;

        logManager?.info('[批处理]', `${name} 完成: ${successful}/${asyncFns.length} 成功`);

        return finalResults;
    }

    /**
     * 判断错误是否可重试
     */
    isRetryable(error) {
        const errorStr = (error.message || error.toString()).toString();

        // 检查不可重试的模式（优先级更高）
        for (const pattern of this.nonRetryablePatterns) {
            if (pattern.test(errorStr)) {
                return false;
            }
        }

        // 检查可重试的模式
        for (const pattern of this.retryablePatterns) {
            if (pattern.test(errorStr)) {
                return true;
            }
        }

        // 默认：网络/超时错误可重试
        return error.name === 'NetworkError' || 
               error.name === 'TimeoutError' ||
               error.code === 'ETIMEDOUT';
    }

    /**
     * 执行具有超时保护的异步函数
     */
    _executeWithTimeout(asyncFn, timeoutMs) {
        return Promise.race([
            asyncFn(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`操作超时: ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    /**
     * 延迟函数
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取重试统计
     */
    getStats() {
        return {
            maxAttempts: this.maxAttempts,
            initialDelay: this.initialDelay,
            maxDelay: this.maxDelay,
            backoffMultiplier: this.backoffMultiplier,
            timeout: this.timeout
        };
    }

    /**
     * 更新配置
     */
    updateConfig(options = {}) {
        Object.assign(this, options);
        logManager?.debug('[重试]', '⚙️  重试配置已更新', this.getStats());
    }
}

// ==========================================
// 预置重试管理器
// ==========================================

// OCR识别（较长操作，需要更多重试）
const ocrRetryManager = new RetryManager({
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    timeout: 60000  // 60秒超时
});

// AI分析（对时间敏感，但需要充分时间）
const aiRetryManager = new RetryManager({
    maxAttempts: 3,
    initialDelay: 2000,
    maxDelay: 15000,
    backoffMultiplier: 2,
    timeout: 90000  // 90秒超时
});

// API请求（快速操作）
const apiRetryManager = new RetryManager({
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 10000,
    backoffMultiplier: 2,
    timeout: 30000  // 30秒超时
});

// Chrome消息（必须快速）
const messageRetryManager = new RetryManager({
    maxAttempts: 2,
    initialDelay: 300,
    maxDelay: 3000,
    backoffMultiplier: 2,
    timeout: 5000  // 5秒超时
});

