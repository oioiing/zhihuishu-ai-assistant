// ==========================================
// 多层缓存系统 - 内存 + 本地存储
// ==========================================

class CacheManager {
    constructor(options = {}) {
        this.memory = new Map();        // 内存缓存（当前页面会话）
        this.storage = {};              // 本地存储缓存（跨会话）
        this.maxMemorySize = options.maxMemorySize || 100;  // 最多100个内存条目
        this.maxStorageSize = options.maxStorageSize || 10 * 1024 * 1024;  // 10MB
        this.storageKey = 'zhihuishu_cache';
        this.metaKey = 'zhihuishu_cache_meta';
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };

        // TTL配置（毫秒）
        this.defaultTTL = options.defaultTTL || {
            studentList: 30 * 60 * 1000,           // 学生列表：30分钟
            teachingClass: 30 * 60 * 1000,        // 教学班级：30分钟
            gradingCriteria: 7 * 24 * 60 * 60 * 1000,  // 评分标准：7天
            homeworkData: 24 * 60 * 60 * 1000,    // 作业数据：1天
            apiResponse: 1 * 60 * 60 * 1000,      // API响应：1小时
            temporary: 5 * 60 * 1000               // 临时数据：5分钟
        };

        // 加载已保存的缓存
        this._loadFromStorage();

        // 定期清理过期数据
        this._setupAutoCleanup();
    }

    /**
     * 设置缓存
     */
    set(key, value, ttlType = 'apiResponse') {
        const ttl = this.defaultTTL[ttlType] || this.defaultTTL.apiResponse;
        const entry = {
            value,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now(),
            ttlType,
            size: this._estimateSize(value)
        };

        // 内存缓存
        if (this.memory.size >= this.maxMemorySize) {
            // 移除最旧的30%条目
            const toRemove = Math.ceil(this.maxMemorySize * 0.3);
            const entries = Array.from(this.memory.entries())
                .sort((a, b) => a[1].createdAt - b[1].createdAt);
            
            for (let i = 0; i < toRemove; i++) {
                this.memory.delete(entries[i][0]);
            }
        }

        this.memory.set(key, entry);

        // 重要数据同时保存到本地存储
        if (ttlType !== 'apiResponse' && ttlType !== 'temporary') {
            this._setInStorage(key, entry);
        }

        this.stats.sets++;
        logManager?.debug('[缓存]', 
            `💾 缓存已设置 [${ttlType}]: ${key} (TTL: ${Math.round(ttl / 1000)}s)`);

        return entry;
    }

    /**
     * 获取缓存
     */
    get(key) {
        // 优先查内存
        let entry = this.memory.get(key);

        // 再查本地存储
        if (!entry) {
            entry = this._getFromStorage(key);
            if (entry) {
                // 放回内存缓存
                this.memory.set(key, entry);
                logManager?.debug('[缓存]', `📌 缓存从存储中恢复: ${key}`);
            }
        }

        // 检查过期
        if (entry && Date.now() > entry.expiresAt) {
            this.delete(key);
            this.stats.misses++;
            return null;
        }

        if (entry) {
            this.stats.hits++;
            logManager?.debug('[缓存]', `✅ 缓存命中: ${key}`);
            return entry.value;
        }

        this.stats.misses++;
        logManager?.debug('[缓存]', `❌ 缓存未找到: ${key}`);
        return null;
    }

    /**
     * 获取或生成缓存
     */
    async getOrGenerate(key, asyncFn, ttlType = 'apiResponse') {
        // 先检查是否有缓存
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        // 没有则生成
        try {
            logManager?.info('[缓存]', `🔄 生成缓存: ${key}`);
            const value = await asyncFn();
            this.set(key, value, ttlType);
            return value;
        } catch (error) {
            logManager?.error('[缓存]', `❌ 缓存生成失败: ${key} - ${error.message}`);
            throw error;
        }
    }

    /**
     * 删除缓存
     */
    delete(key) {
        const existed = this.memory.has(key) || (this.storage && this.storage[key]);
        
        this.memory.delete(key);
        if (this.storage) {
            delete this.storage[key];
        }

        if (existed) {
            this.stats.deletes++;
            logManager?.debug('[缓存]', `🗑️  缓存已删除: ${key}`);
            this._saveToStorage();
        }
    }

    /**
     * 清空所有缓存
     */
    clear() {
        const memorySize = this.memory.size;
        const storageSize = Object.keys(this.storage || {}).length;

        this.memory.clear();
        this.storage = {};

        try {
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.metaKey);
        } catch (e) {
            logManager?.warn('[缓存]', '⚠️  清空本地存储失败');
        }

        logManager?.info('[缓存]', 
            `🗑️  已清空所有缓存 - 内存: ${memorySize} 条, 存储: ${storageSize} 条`);
    }

    /**
     * 清理过期数据
     */
    cleanup() {
        const now = Date.now();
        let cleanedMemory = 0;
        let cleanedStorage = 0;

        // 清理内存缓存
        for (const [key, entry] of this.memory.entries()) {
            if (now > entry.expiresAt) {
                this.memory.delete(key);
                cleanedMemory++;
            }
        }

        // 清理存储缓存
        if (this.storage) {
            for (const [key, entry] of Object.entries(this.storage)) {
                if (now > entry.expiresAt) {
                    delete this.storage[key];
                    cleanedStorage++;
                }
            }
            this._saveToStorage();
        }

        if (cleanedMemory > 0 || cleanedStorage > 0) {
            logManager?.info('[缓存]', 
                `🧹 清理过期数据 - 内存: ${cleanedMemory}, 存储: ${cleanedStorage}`);
        }

        return { cleanedMemory, cleanedStorage };
    }

    /**
     * 获取缓存统计
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0 ?
            (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) :
            '0.00';

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            memorySize: this.memory.size,
            storageSize: Object.keys(this.storage || {}).length,
            byType: this._getStatsByType()
        };
    }

    /**
     * 打印缓存统计
     */
    printStats() {
        const stats = this.getStats();
        console.log('%c📊 缓存统计', 'color: #0066cc; font-weight: bold; font-size: 14px');
        console.log(`  缓存命中率: ${stats.hitRate}`);
        console.log(`  命中: ${stats.hits}, 未命中: ${stats.misses}, 设置: ${stats.sets}, 删除: ${stats.deletes}`);
        console.log(`  内存条目: ${stats.memorySize}/${this.maxMemorySize}`);
        console.log(`  存储条目: ${stats.storageSize}`);
        console.log('  按类型:', stats.byType);
    }

    /**
     * 私有方法
     */
    _setInStorage(key, entry) {
        try {
            this.storage[key] = entry;
            this._saveToStorage();
        } catch (e) {
            logManager?.warn('[缓存]', `⚠️  存储设置失败: ${e.message}`);
            if (e.name === 'QuotaExceededError') {
                this._cleanupStorage();
            }
        }
    }

    _getFromStorage(key) {
        try {
            return this.storage[key];
        } catch (e) {
            return null;
        }
    }

    _saveToStorage() {
        try {
            const data = JSON.stringify(this.storage);
            localStorage.setItem(this.storageKey, data);
            localStorage.setItem(this.metaKey, JSON.stringify({
                count: Object.keys(this.storage).length,
                lastSaved: new Date().toISOString(),
                version: 2
            }));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                this._cleanupStorage();
            }
        }
    }

    _loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.storage = JSON.parse(stored);
                console.log(`📌 已加载 ${Object.keys(this.storage).length} 条存储缓存`);
            }
        } catch (e) {
            console.warn('⚠️  存储加载失败:', e.message);
            this.storage = {};
        }
    }

    _cleanupStorage() {
        const now = Date.now();
        const entries = Object.entries(this.storage)
            .filter(([_, v]) => v.expiresAt > now)
            .sort((a, b) => b[1].createdAt - a[1].createdAt);

        // 保留50%
        const kept = entries.slice(0, Math.floor(entries.length / 2));
        this.storage = Object.fromEntries(kept);
        this._saveToStorage();

        logManager?.warn('[缓存]', 
            `♻️  已清理存储缓存至 ${kept.length} 条（原有 ${entries.length} 条）`);
    }

    _setupAutoCleanup() {
        // 每5分钟自动清理一次
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    _estimateSize(obj) {
        try {
            return JSON.stringify(obj).length;
        } catch (e) {
            return 0;
        }
    }

    _getStatsByType() {
        const stats = {};
        for (const [_, entry] of this.memory.entries()) {
            stats[entry.ttlType] = (stats[entry.ttlType] || 0) + 1;
        }
        return stats;
    }
}

// ==========================================
// 全局缓存管理器实例
// ==========================================

const cacheManager = new CacheManager({
    maxMemorySize: 100,
    maxStorageSize: 10 * 1024 * 1024  // 10MB
});

