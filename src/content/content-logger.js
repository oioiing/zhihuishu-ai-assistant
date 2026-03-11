// ==========================================
// 结构化日志系统 - 支持本地存储和导出
// ==========================================

class LogManager {
    constructor(maxSize = 1000) {
        this.logs = [];
        this.maxSize = maxSize;
        this.retentionDays = 7;
        this.loadFromStorage();
        this.cleanExpiredLogs();
    }

    log(level, module, message, data = null) {
        const entry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            epochTime: Date.now(),
            level,      // debug|info|warn|error|success
            module,     // [Background]|[Content]|[Popup]|[OCR]|[AI]
            message,
            data,
            url: window.location?.href || 'unknown',
            userAgent: navigator.userAgent.substring(0, 50)
        };

        // 添加到内存
        this.logs.push(entry);

        // 超出限制移除最旧的
        if (this.logs.length > this.maxSize) {
            this.logs = this.logs.slice(-this.maxSize);
        }

        // 同时输出到console
        this._logToConsole(entry);

        // 保存到本地存储
        this.saveToStorage();

        // 错误级别的日志也发送到background用于分析
        if (level === 'error') {
            this._reportErrorToBackground(entry).catch(e => {
                console.warn('📊 Error reporting failed:', e.message);
            });
        }

        return entry;
    }

    debug(module, message, data) {
        return this.log('debug', module, message, data);
    }

    info(module, message, data) {
        return this.log('info', module, message, data);
    }

    warn(module, message, data) {
        return this.log('warn', module, message, data);
    }

    error(module, message, data) {
        return this.log('error', module, message, data);
    }

    success(module, message, data) {
        return this.log('success', module, message, data);
    }

    _logToConsole(entry) {
        const prefix = `[${entry.level.toUpperCase()}] ${entry.module}`;
        const style = {
            'debug': 'color: #999; font-size: 12px',
            'info': 'color: #0066cc; font-weight: bold',
            'warn': 'color: #ff6600; font-weight: bold',
            'error': 'color: #cc0000; font-weight: bold',
            'success': 'color: #00cc00; font-weight: bold'
        };

        console.log(`%c${prefix}`, style[entry.level] || '', entry.message);
        if (entry.data) {
            console.log('  数据:', entry.data);
        }
    }

    async _reportErrorToBackground(entry) {
        // 异步发送错误到background分析
        try {
            const { sanitized } = await sendMessageSafely('reportErrorLog', {
                level: entry.level,
                module: entry.module,
                message: entry.message,
                timestamp: entry.epochTime,
                url: entry.url
            }, 5000);
        } catch (e) {
            // 静默失败，不中断主流程
        }
    }

    saveToStorage() {
        try {
            const data = JSON.stringify(this.logs);
            localStorage.setItem('zhihuishu_logs', data);
            localStorage.setItem('zhihuishu_logs_meta', JSON.stringify({
                count: this.logs.length,
                lastSaved: new Date().toISOString(),
                version: 1
            }));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.warn('📊 存储容量已满，清理50%旧日志');
                this.logs = this.logs.slice(-Math.floor(this.maxSize / 2));
                try {
                    localStorage.setItem('zhihuishu_logs', JSON.stringify(this.logs));
                } catch (e2) {
                    console.error('❌ 日志存储失败:', e2.message);
                }
            }
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem('zhihuishu_logs');
            if (stored) {
                this.logs = JSON.parse(stored);
                console.log(`📊 已加载 ${this.logs.length} 条历史日志`);
            }
        } catch (e) {
            console.warn('⚠️ 日志加载失败:', e.message);
            this.logs = [];
        }
    }

    cleanExpiredLogs() {
        const expirationTime = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
        const beforeCount = this.logs.length;
        this.logs = this.logs.filter(log => log.epochTime > expirationTime);
        const removed = beforeCount - this.logs.length;

        if (removed > 0) {
            console.log(`📊 清理了 ${removed} 条过期日志（${this.retentionDays}天外）`);
            this.saveToStorage();
        }
    }

    exportLogs(format = 'json') {
        if (format === 'json') {
            return JSON.stringify(this.logs, null, 2);
        } else if (format === 'csv') {
            return this._convertToCSV();
        } else if (format === 'html') {
            return this._convertToHTML();
        }
    }

    _convertToCSV() {
        const headers = ['时间', '级别', '模块', '消息', '数据', '页面'];
        const rows = this.logs.map(log => [
            log.timestamp,
            log.level.toUpperCase(),
            log.module,
            log.message,
            log.data ? JSON.stringify(log.data) : '',
            log.url
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return csvContent;
    }

    _convertToHTML() {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>智慧树作业助手 - 日志报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #0066cc; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        th { background: #f0f0f0; padding: 12px; text-align: left; font-weight: bold; border-bottom: 2px solid #0066cc; }
        td { padding: 10px; border-bottom: 1px solid #eee; }
        tr:hover { background: #f9f9f9; }
        .debug { color: #999; }
        .info { color: #0066cc; }
        .warn { color: #ff6600; }
        .error { color: #cc0000; font-weight: bold; }
        .success { color: #00cc00; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 智慧树作业助手 - 日志报告</h1>
        <p>导出时间: ${new Date().toLocaleString()}</p>
        <p>总日志条数: ${this.logs.length}</p>
    </div>
    <table>
        <tr>
            <th>时间</th>
            <th>级别</th>
            <th>模块</th>
            <th>消息</th>
            <th>URL</th>
        </tr>
        ${this.logs.map(log => `
        <tr>
            <td>${log.timestamp}</td>
            <td class="${log.level}">${log.level.toUpperCase()}</td>
            <td>${log.module}</td>
            <td>${log.message}</td>
            <td>${log.url}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>
        `;
        return html;
    }

    downloadLogs(format = 'json') {
        const content = this.exportLogs(format);
        const mimeType = {
            'json': 'application/json',
            'csv': 'text/csv',
            'html': 'text/html'
        }[format];

        const extension = format;
        const filename = `logs-${new Date().toISOString().slice(0, 10)}.${extension}`;

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`📊 日志已导出: ${filename}`);
    }

    getStatistics() {
        const stats = {
            total: this.logs.length,
            byLevel: {},
            byModule: {},
            errors: [],
            warnings: [],
            recentErrors: []
        };

        this.logs.forEach(log => {
            // 按级别统计
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;

            // 按模块统计
            stats.byModule[log.module] = (stats.byModule[log.module] || 0) + 1;

            // 收集错误
            if (log.level === 'error') {
                stats.errors.push({
                    message: log.message,
                    module: log.module,
                    timestamp: log.timestamp
                });
            }

            // 收集警告
            if (log.level === 'warn') {
                stats.warnings.push({
                    message: log.message,
                    module: log.module,
                    timestamp: log.timestamp
                });
            }
        });

        // 获取最近5条错误
        stats.recentErrors = stats.errors.slice(-5);

        return stats;
    }

    printStatistics() {
        const stats = this.getStatistics();
        console.log('📊 ===== 日志统计 =====');
        console.log(`📋 总条数: ${stats.total}`);
        console.log('📈 按级别:', stats.byLevel);
        console.log('🏷️  按模块:', stats.byModule);
        if (stats.errors.length > 0) {
            console.log('⚠️  最近错误:', stats.recentErrors);
        }
    }

    clear() {
        const count = this.logs.length;
        this.logs = [];
        localStorage.removeItem('zhihuishu_logs');
        localStorage.removeItem('zhihuishu_logs_meta');
        console.log(`🗑️  已清空 ${count} 条日志`);
    }
}

// ==========================================
// 全局日志管理器实例
// ==========================================
const logManager = new LogManager(1000);

