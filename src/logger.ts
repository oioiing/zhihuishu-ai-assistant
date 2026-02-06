/**
 * 日志工具模块
 * Logger utility module
 */

import { LogLevel, LoggerConfig } from './types';

export class Logger {
    private config: LoggerConfig;

    constructor(config?: Partial<LoggerConfig>) {
        this.config = {
            enabled: true,
            level: LogLevel.INFO,
            prefix: '[ZhiHuiShu-Grading]',
            showTimestamp: true,
            ...config
        };
    }

    /**
     * 获取时间戳字符串
     */
    private getTimestamp(): string {
        if (!this.config.showTimestamp) return '';
        const now = new Date();
        return `[${now.toLocaleTimeString()}.${now.getMilliseconds()}]`;
    }

    /**
     * 判断日志级别是否应该输出
     */
    private shouldLog(level: LogLevel): boolean {
        if (!this.config.enabled) return false;
        
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const currentIndex = levels.indexOf(this.config.level);
        const messageIndex = levels.indexOf(level);
        
        return messageIndex >= currentIndex;
    }

    /**
     * 格式化日志消息
     */
    private format(level: LogLevel, message: string, ...args: any[]): any[] {
        const timestamp = this.getTimestamp();
        const prefix = `${timestamp}${this.config.prefix}[${level}]`;
        return [prefix, message, ...args];
    }

    /**
     * DEBUG级别日志
     */
    debug(message: string, ...args: any[]): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(...this.format(LogLevel.DEBUG, message, ...args));
        }
    }

    /**
     * INFO级别日志
     */
    info(message: string, ...args: any[]): void {
        if (this.shouldLog(LogLevel.INFO)) {
            console.info(...this.format(LogLevel.INFO, message, ...args));
        }
    }

    /**
     * WARN级别日志
     */
    warn(message: string, ...args: any[]): void {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(...this.format(LogLevel.WARN, message, ...args));
        }
    }

    /**
     * ERROR级别日志
     */
    error(message: string, ...args: any[]): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(...this.format(LogLevel.ERROR, message, ...args));
        }
    }

    /**
     * 分组日志开始
     */
    group(label: string): void {
        if (this.config.enabled) {
            console.group(`${this.config.prefix} ${label}`);
        }
    }

    /**
     * 分组日志结束
     */
    groupEnd(): void {
        if (this.config.enabled) {
            console.groupEnd();
        }
    }

    /**
     * 表格日志
     */
    table(data: any): void {
        if (this.config.enabled) {
            console.table(data);
        }
    }

    /**
     * 更新配置
     */
    setConfig(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

// 导出默认实例
export const logger = new Logger({
    enabled: true,
    level: LogLevel.DEBUG,
    prefix: '[智慧树批改]',
    showTimestamp: true
});
