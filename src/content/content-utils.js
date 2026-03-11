// 智能作业阅卷助手 - 通用工具库

// ==========================================
// 全局状态管理
// ==========================================
const AUTO_GRADING_STATE = {
    isRunning: false,                   // 是否正在自动批改
    isPaused: false,                    // 是否暂停中
    currentStudentIndex: 0,             // 当前批改的学生索引
    totalStudents: 0,                   // 总学生数
    studentList: [],                    // 学生列表
    questionData: null,                 // 题目数据
    standardAnswer: '',                 // 缓存标准答案
    currentScore: null,                 // 当前评分
    currentFeedback: null,              // 当前评语
    autoNavigate: true,                 // 是否自动跳转到下一个学生
    includeReviewedSubmissions: false,  // 是否包括已批阅的作业（用于重新批阅）
    autoExecutionMode: 'full',          // 自动执行模式：manual | navigate_only | full
    autoModeEnabled: true,              // 兼容旧逻辑字段（由 autoExecutionMode 映射）
    showRuleScoringBreakdown: true,     // 是否显示规则评分明细
    autoGradingConditions: {
        gradingCriteria: [],            // 评分标准列表
        gradingCriteriaItems: [],       // 结构化评分标准（含分值）
        gradingAdvice: '',              // 批改建议文本
        gradingAdviceRich: '',          // 富文本批改建议
        referenceAnswerType: '',        // 参考答案类型：objective | model_essay
        referenceAnswer: '',            // 参考答案内容（客观题答案或作文范文）
        commonMistakes: [],             // 常见错误列表
        homeworkType: '',               // 作业类型
        typeExplanation: '',            // 作业类型说明
        schemaVersion: 3,               // 配置结构版本
        isSet: false                    // 是否已设置条件
    },
    currentHomeworkType: '',
    lastAIGradingResult: null,
    studentNameCache: [],               // 缓存所有学生姓名
    studentNameCacheLoaded: false,      // 是否已加载学生姓名缓存
    criteriaNameDisplayMode: 'wrap'     // 评分项名称显示模式：wrap | single-line
};

const SETTINGS_KEYS = {
    showRuleScoringBreakdown: 'zhai_show_rule_breakdown',
    autoExecutionMode: 'zhai_auto_execution_mode',
    autoModeEnabled: 'zhai_auto_mode_enabled',
    criteriaNameDisplayMode: 'zhai_criteria_name_display_mode',
    manualCriteriaConditions: 'zhai_manual_criteria_conditions',
    logLevel: 'zhai_log_level'
};

const AUTO_EXECUTION_MODES = {
    manual: 'manual',
    navigateOnly: 'navigate_only',
    full: 'full'
};

// ==========================================
// 日志和调试
// ==========================================
const LOG_LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 99
};

let CURRENT_LOG_LEVEL = 'info';

function setLogLevel(level) {
    const normalized = String(level || '').toLowerCase();
    CURRENT_LOG_LEVEL = Object.prototype.hasOwnProperty.call(LOG_LEVELS, normalized) ? normalized : 'info';
}

function shouldLog(level) {
    const current = LOG_LEVELS[CURRENT_LOG_LEVEL] ?? LOG_LEVELS.info;
    const target = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    return target >= current;
}

const appLogger = {
    debug: (...args) => {
        if (shouldLog('debug')) console.debug(...args);
    },
    info: (...args) => {
        if (shouldLog('info')) console.info(...args);
    },
    warn: (...args) => {
        if (shouldLog('warn')) console.warn(...args);
    },
    error: (...args) => {
        if (shouldLog('error')) console.error(...args);
    }
};

// ==========================================
// 自动执行模式处理
// ==========================================
function normalizeAutoExecutionMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    if (value === AUTO_EXECUTION_MODES.manual || value === AUTO_EXECUTION_MODES.navigateOnly || value === AUTO_EXECUTION_MODES.full) {
        return value;
    }
    return AUTO_EXECUTION_MODES.full;
}

function setAutoExecutionMode(mode) {
    const normalized = normalizeAutoExecutionMode(mode);
    AUTO_GRADING_STATE.autoExecutionMode = normalized;
    AUTO_GRADING_STATE.autoModeEnabled = normalized !== AUTO_EXECUTION_MODES.manual;
}

// ==========================================
// 评分标准数据迁移和规范化
// ==========================================
const MANUAL_CRITERIA_SCHEMA_VERSION = 3;

function parseLegacyCriterionText(text = '') {
    const raw = String(text || '').trim();
    if (!raw) {
        return { name: '', score: 0 };
    }

    const scoreMatch = raw.match(/（\s*(\d{1,3})\s*分\s*）$/);
    const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10))) : 0;
    const name = scoreMatch ? raw.replace(/（\s*\d{1,3}\s*分\s*）$/, '').trim() : raw;
    return { name, score };
}

function normalizeCriteriaItems(criteriaItems, gradingCriteria) {
    if (Array.isArray(criteriaItems) && criteriaItems.length > 0) {
        return criteriaItems
            .map(item => ({
                name: String(item?.name || '').trim(),
                score: Math.min(100, Math.max(0, Math.round(Number(item?.score) || 0)))
            }))
            .filter(item => item.name.length > 0);
    }

    if (Array.isArray(gradingCriteria) && gradingCriteria.length > 0) {
        return gradingCriteria
            .map(parseLegacyCriterionText)
            .filter(item => item.name.length > 0);
    }

    return [];
}

function migrateAutoGradingConditions(rawConditions) {
    const source = rawConditions && typeof rawConditions === 'object' ? rawConditions : {};
    const migratedItems = normalizeCriteriaItems(source.gradingCriteriaItems, source.gradingCriteria);
    const gradingCriteria = migratedItems.map(item => `${item.name}（${item.score}分）`);
    const normalizedReferenceAnswerType = String(source.referenceAnswerType || '').trim();
    const referenceAnswerType = (normalizedReferenceAnswerType === 'objective' || normalizedReferenceAnswerType === 'model_essay')
        ? normalizedReferenceAnswerType
        : '';

    return {
        gradingCriteria,
        gradingCriteriaItems: migratedItems,
        gradingAdvice: String(source.gradingAdvice || '').trim(),
        gradingAdviceRich: String(source.gradingAdviceRich || '').trim(),
        referenceAnswerType,
        referenceAnswer: String(source.referenceAnswer || '').trim(),
        commonMistakes: Array.isArray(source.commonMistakes) ? source.commonMistakes.filter(Boolean) : [],
        homeworkType: String(source.homeworkType || '').trim(),
        typeExplanation: String(source.typeExplanation || '').trim(),
        schemaVersion: MANUAL_CRITERIA_SCHEMA_VERSION,
        isSet: migratedItems.length > 0 && !!String(source.homeworkType || '').trim()
    };
}

// ==========================================
// 本地存储持久化
// ==========================================
function persistManualCriteriaConditions() {
    try {
        const payload = {
            version: MANUAL_CRITERIA_SCHEMA_VERSION,
            data: migrateAutoGradingConditions(AUTO_GRADING_STATE.autoGradingConditions)
        };
        localStorage.setItem(SETTINGS_KEYS.manualCriteriaConditions, JSON.stringify(payload));
    } catch (error) {
        appLogger.warn('⚠️ [设置] 保存评分标准配置失败:', error.message);
    }
}

function loadPersistedSettings() {
    try {
        const persistedShowRuleBreakdown = localStorage.getItem(SETTINGS_KEYS.showRuleScoringBreakdown);
        if (persistedShowRuleBreakdown !== null) {
            AUTO_GRADING_STATE.showRuleScoringBreakdown = persistedShowRuleBreakdown === '1';
        }

        const persistedMode = localStorage.getItem(SETTINGS_KEYS.autoExecutionMode);
        if (persistedMode !== null) {
            setAutoExecutionMode(persistedMode);
        } else {
            const persistedAutoMode = localStorage.getItem(SETTINGS_KEYS.autoModeEnabled);
            if (persistedAutoMode !== null) {
                setAutoExecutionMode(persistedAutoMode === '1' ? AUTO_EXECUTION_MODES.full : AUTO_EXECUTION_MODES.manual);
                persistAutoExecutionModeSetting(AUTO_GRADING_STATE.autoExecutionMode);
            }
        }

        const persistedDisplayMode = localStorage.getItem(SETTINGS_KEYS.criteriaNameDisplayMode);
        if (persistedDisplayMode === 'wrap' || persistedDisplayMode === 'single-line') {
            AUTO_GRADING_STATE.criteriaNameDisplayMode = persistedDisplayMode;
        }

        const persistedLogLevel = localStorage.getItem(SETTINGS_KEYS.logLevel);
        if (persistedLogLevel) {
            setLogLevel(persistedLogLevel);
        }

        const persistedManualRaw = localStorage.getItem(SETTINGS_KEYS.manualCriteriaConditions);
        if (persistedManualRaw) {
            const parsed = JSON.parse(persistedManualRaw);
            const sourceData = parsed?.data || parsed;
            const migrated = migrateAutoGradingConditions(sourceData);
            AUTO_GRADING_STATE.autoGradingConditions = migrated;

            const persistedVersion = Number(parsed?.version || sourceData?.schemaVersion || 0);
            if (persistedVersion !== MANUAL_CRITERIA_SCHEMA_VERSION) {
                persistManualCriteriaConditions();
                appLogger.info('🔄 [设置] 已完成评分标准旧版数据迁移');
            }
        }
    } catch (error) {
        appLogger.warn('⚠️ [设置] 读取本地设置失败:', error.message);
    }
}

function persistRuleBreakdownSetting(value) {
    try {
        localStorage.setItem(SETTINGS_KEYS.showRuleScoringBreakdown, value ? '1' : '0');
    } catch (error) {
        appLogger.warn('⚠️ [设置] 保存规则明细开关失败:', error.message);
    }
}

function persistAutoModeSetting(value) {
    try {
        localStorage.setItem(SETTINGS_KEYS.autoModeEnabled, value ? '1' : '0');
    } catch (error) {
        appLogger.warn('⚠️ [设置] 保存自动模式开关失败:', error.message);
    }
}

function persistAutoExecutionModeSetting(mode) {
    try {
        const normalized = normalizeAutoExecutionMode(mode);
        localStorage.setItem(SETTINGS_KEYS.autoExecutionMode, normalized);
        localStorage.setItem(SETTINGS_KEYS.autoModeEnabled, normalized === AUTO_EXECUTION_MODES.manual ? '0' : '1');
    } catch (error) {
        appLogger.warn('⚠️ [设置] 保存自动执行模式失败:', error.message);
    }
}

function persistCriteriaNameDisplayMode(mode) {
    try {
        const finalMode = mode === 'single-line' ? 'single-line' : 'wrap';
        localStorage.setItem(SETTINGS_KEYS.criteriaNameDisplayMode, finalMode);
        AUTO_GRADING_STATE.criteriaNameDisplayMode = finalMode;
    } catch (error) {
        appLogger.warn('⚠️ [设置] 保存评分项名称显示模式失败:', error.message);
    }
}

function persistLogLevel(level) {
    try {
        setLogLevel(level);
        localStorage.setItem(SETTINGS_KEYS.logLevel, CURRENT_LOG_LEVEL);
    } catch (error) {
        appLogger.warn('⚠️ [设置] 保存日志级别失败:', error.message);
    }
}

// ==========================================
// 通知和UI工具
// ==========================================
function showNotification(message, backgroundColor = '#2196F3') {
    try {
        let container = document.getElementById('zh-notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'zh-notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        const notification = document.createElement('div');
        notification.style.cssText = `
            background: ${backgroundColor};
            color: #fff;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
            word-break: break-word;
            pointer-events: auto;
        `;
        notification.textContent = message;
        container.appendChild(notification);

        const timeout = setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);

        notification.addEventListener('click', () => {
            clearTimeout(timeout);
            notification.remove();
        });

        if (!document.querySelector('style[data-zh-animation]')) {
            const style = document.createElement('style');
            style.setAttribute('data-zh-animation', '1');
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(400px); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    } catch (error) {
        console.error('❌ [通知] 显示失败:', error);
    }
}
// ==========================================
// 快速修复:统一的消息发送函数
// ==========================================
async function sendMessageSafely(action, data = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`消息'${action}'在${timeoutMs/1000}秒后无响应。请检查：1) API Key是否设置 2) Background Service Worker是否运行`));
        }, timeoutMs);

        try {
            chrome.runtime.sendMessage({ action, data }, (response) => {
                clearTimeout(timeoutId);

                if (chrome.runtime.lastError) {
                    reject(new Error(`Chrome通信错误: ${chrome.runtime.lastError.message}`));
                    return;
                }

                if (!response) {
                    reject(new Error('Background无响应（可能是Service Worker已停用）'));
                    return;
                }

                if (response.success === false) {
                    reject(new Error(response.error || '请求处理失败'));
                    return;
                }

                resolve(response);
            });
        } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
        }
    });
}

// ==========================================
// 快速修复:定时器管理器（防止泄漏）
// ==========================================
class TimerManager {
    constructor() {
        this.timers = new Map();
        this.intervals = new Map();
    }

    setTimeout(id, callback, delay) {
        if (this.timers.has(id)) {
            clearTimeout(this.timers.get(id));
        }
        const timer = setTimeout(() => {
            callback();
            this.timers.delete(id);
        }, delay);
        this.timers.set(id, timer);
        return timer;
    }

    setInterval(id, callback, interval) {
        if (this.intervals.has(id)) {
            clearInterval(this.intervals.get(id));
        }
        const timer = setInterval(callback, interval);
        this.intervals.set(id, timer);
        return timer;
    }

    clearTimer(id) {
        const timer = this.timers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(id);
        }
    }

    clearInterval(id) {
        const timer = this.intervals.get(id);
        if (timer) {
            clearInterval(timer);
            this.intervals.delete(id);
        }
    }

    clearAll() {
        for (let timer of this.timers.values()) {
            clearTimeout(timer);
        }
        for (let timer of this.intervals.values()) {
            clearInterval(timer);
        }
        this.timers.clear();
        this.intervals.clear();
    }
}

const timerManager = new TimerManager();

// ==========================================
// 快速修复:防抖函数（处理高频事件）
// ==========================================
function debounce(func, delay, options = {}) {
    let timeoutId;
    let lastResult;

    return function debounced(...args) {
        const executeNow = options.leading && !timeoutId;
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            if (!options.leading) {
                lastResult = func.apply(this, args);
            }
            timeoutId = null;
        }, delay);

        if (executeNow) {
            lastResult = func.apply(this, args);
        }

        return lastResult;
    };
}

// 页面卸载时自动清理
window.addEventListener('beforeunload', () => {
    timerManager.clearAll();
    appLogger.debug('✅ [清理] 定时器已清理');
});
function closePanelIfExists() {
    const panel = document.getElementById('zh-analysis-panel');
    if (panel) panel.remove();
}

// ==========================================
// 作业类型常量定义
// ==========================================
const HOMEWORK_TYPES = {
    VOCAB_CHOICE: 'vocab_choice',           // (1) 词汇选择题
    READING_CHOICE: 'reading_choice',       // (2) 阅读理解选择题
    READING_SHORT: 'reading_short',         // (3) 阅读理解简答题  
    SENTENCE_REWRITE: 'sentence_rewrite',   // (4) 句子改写
    SENTENCE_COMBINE: 'sentence_combine',   // (5) 句子合并
    PARAGRAPH_REWRITE: 'paragraph_rewrite', // (6) 段落改写
    SHORT_ESSAY: 'short_essay',             // (7) 短文写作
    TEM4_WRITING: 'tem4_writing',           // (8) 专四写作练习
    MULTIMODAL: 'multimodal',               // (9) 多模态作品
    // 兼容旧类型（映射）
    CHOICE: 'vocab_choice',
    FILL_BLANK: 'reading_short',
    ESSAY: 'short_essay'
};

// ==========================================
// 导出
// ==========================================
// 这些变量和函数在全局作用域中可用，供其他模块使用
