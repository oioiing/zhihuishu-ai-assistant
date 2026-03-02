// 智能作业阅卷助手 - 前端脚本

console.debug('=== Content Script 加载开始 ===');

// 全局错误捕获
window.addEventListener('error', (e) => {
    console.error('❌ [Content] 页面错误:', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ [Content] Promise错误:', e.reason);
});

(function() {
    'use strict';

    try {
        if (window.zhihuishuAIAssistantInjected) {
            console.debug('⚠️ Content script已经注入，跳过重复加载');
            return;
        }
        window.zhihuishuAIAssistantInjected = true;

        console.debug('🚀 [Content] 智能作业阅卷助手启动...');
        console.debug('📍 [Content] 当前页面:', window.location.href);
        console.debug('📍 [Content] DOM状态:', document.readyState);

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
        showRuleScoringBreakdown: true,     // 是否显示规则评分明细
        
        // 从作业分析获取的自动批改条件
        autoGradingConditions: {
            gradingCriteria: [],            // 评分标准列表
            gradingCriteriaItems: [],       // 结构化评分标准（含分值）
            gradingAdvice: '',              // 批改建议文本
            gradingAdviceRich: '',          // 富文本批改建议
            commonMistakes: [],             // 常见错误列表
            homeworkType: '',               // 作业类型
            typeExplanation: '',            // 作业类型说明
            schemaVersion: 2,               // 配置结构版本
            isSet: false                    // 是否已设置条件
        },

        // 当前作业类型（供评语生成逻辑使用）
        currentHomeworkType: '',
        lastAIGradingResult: null,
        
        // 学生姓名缓存（用于自动补全）
        studentNameCache: [],               // 缓存所有学生姓名
        studentNameCacheLoaded: false,      // 是否已加载学生姓名缓存
        criteriaNameDisplayMode: 'wrap'     // 评分项名称显示模式：wrap | single-line
    };

    const SETTINGS_KEYS = {
        showRuleScoringBreakdown: 'zhai_show_rule_breakdown',
        criteriaNameDisplayMode: 'zhai_criteria_name_display_mode',
        manualCriteriaConditions: 'zhai_manual_criteria_conditions',
        logLevel: 'zhai_log_level'
    };

    const MANUAL_CRITERIA_SCHEMA_VERSION = 2;
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

        return {
            gradingCriteria,
            gradingCriteriaItems: migratedItems,
            gradingAdvice: String(source.gradingAdvice || '').trim(),
            gradingAdviceRich: String(source.gradingAdviceRich || '').trim(),
            commonMistakes: Array.isArray(source.commonMistakes) ? source.commonMistakes.filter(Boolean) : [],
            homeworkType: String(source.homeworkType || '').trim(),
            typeExplanation: String(source.typeExplanation || '').trim(),
            schemaVersion: MANUAL_CRITERIA_SCHEMA_VERSION,
            isSet: migratedItems.length > 0 && !!String(source.homeworkType || '').trim()
        };
    }

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

    function syncLogLevelFromExtensionStorage() {
        try {
            if (!chrome?.storage?.local) return;
            chrome.storage.local.get(['zhai_log_level'], (data) => {
                if (chrome.runtime.lastError) return;
                const storageLevel = data?.zhai_log_level;
                if (storageLevel) {
                    setLogLevel(storageLevel);
                }
            });

            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName !== 'local') return;
                if (!changes?.zhai_log_level) return;
                setLogLevel(changes.zhai_log_level.newValue || 'info');
            });
        } catch (error) {
            appLogger.warn('⚠️ [设置] 同步扩展日志级别失败:', error.message);
        }
    }

    loadPersistedSettings();
    syncLogLevelFromExtensionStorage();

    // 班级级别的统计信息与能力画像
    const CLASS_ANALYTICS = {
        errorCounts: {},              // {category: count}
        aiProbabilities: [],          // [number]
        studentProgress: {},          // {name: [{score, skills, ts, homeworkType}]}
        badgeHits: {},                // {badgeName: count}
        logicQuestions: [],           // 汇总逻辑追问
        cultureTips: [],              // 汇总文化提示
        practiceRecommendations: []   // 汇总练习/微课
    };

    // 测试与background的连接
    function testBackgroundConnection() {
        appLogger.debug('🔍 [Content] 测试background连接...');
        chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
            if (chrome.runtime.lastError) {
                appLogger.error('❌ [Content] Background连接失败:', chrome.runtime.lastError.message);
                appLogger.error('❌ [Content] 请刷新页面或重新加载扩展');
            } else if (response && response.success) {
                appLogger.debug('✅ [Content] Background连接正常:', response);
            } else {
                appLogger.warn('⚠️ [Content] Background响应异常:', response);
            }
        });
    }

    // 延迟测试连接，确保background已启动
    setTimeout(testBackgroundConnection, 1000);

    // ==========================================
    // 1. 全屏控制函数
    // ==========================================
    
    // 进入全屏模式
    window.enterFullScreen = function() {
        try {
            appLogger.debug('📺 [全屏] 尝试进入全屏模式...');
            
            // 方法1: 尝试多个选择器查找全屏按钮
            const selectors = [
                '[onclick*="fullScreen"]',
                '.full-btn1',
                '[title*="全屏"]',
                '[aria-label*="全屏"]',
                'a.full-btn1',
                'a[title="全屏"]',
                '[class*="fullscreen"]',
                '[class*="full-screen"]',
                'button[title*="全屏"]',
                '.full-box a',
                '[onclick="fullScreen()"]'
            ];
            
            for (let selector of selectors) {
                const btn = document.querySelector(selector);
                if (btn && btn.offsetParent !== null) { // offsetParent为null表示隐藏
                    appLogger.debug(`✅ [全屏] 使用选择器"${selector}"找到按钮，点击中...`);
                    btn.click();
                    return true;
                }
            }
            
            // 方法2: 查找所有带有"全屏"文本的元素
            const allElements = document.querySelectorAll('*');
            for (let el of allElements) {
                if (el.textContent && el.textContent.trim() === '全屏' && el.offsetParent !== null) {
                    const clickable = el.closest('a, button, [role="button"]');
                    if (clickable) {
                        appLogger.debug('✅ [全屏] 通过文本查找到全屏按钮，点击中...');
                        clickable.click();
                        return true;
                    }
                }
            }
            
            // 方法3: 直接调用页面的fullScreen函数（如果存在）
            if (typeof window.fullScreen === 'function') {
                appLogger.debug('✅ [全屏] 调用页面 fullScreen() 函数');
                window.fullScreen();
                return true;
            }
            
            // 调试：打印可能的按钮信息
            const possibleBtns = document.querySelectorAll('a, button, [role="button"]');
            let found = false;
            for (let btn of possibleBtns) {
                if (btn.textContent.includes('全') || btn.onclick?.toString().includes('fullScreen')) {
                    appLogger.debug('🔍 [全屏] 可能的按钮:', btn.outerHTML.substring(0, 100));
                    found = true;
                }
            }
            if (!found) {
                appLogger.warn('⚠️ [全屏] 页面中未找到任何全屏相关按钮');
            }
            
            appLogger.warn('⚠️ [全屏] 无法进入全屏，将继续处理图片（质量可能降低）');
            // 尝试让 background 在所有 iframe 中触发全屏按钮
            try {
                chrome.runtime.sendMessage({ action: 'enterFullScreenInFrames' }, () => {});
            } catch (e) {
                // 忽略异常
            }
            return false;
        } catch (error) {
            appLogger.error('❌ [全屏] 进入全屏时出错:', error);
            return false;
        }
    };
    
    // 退出全屏模式
    window.exitFullScreen = function() {
        try {
            appLogger.debug('📺 [全屏] 尝试退出全屏模式...');
            
            // 方法1: 多个选择器查找退出全屏按钮
            const selectors = [
                '.full-btn2',
                '[class*="exit-fullscreen"]',
                '[class*="退出全屏"]',
                'a[title*="退出"]',
                'button[title*="退出"]'
            ];
            
            for (let selector of selectors) {
                const btn = document.querySelector(selector);
                if (btn && btn.offsetParent !== null) {
                    appLogger.debug(`✅ [全屏] 使用选择器"${selector}"找到退出按钮，点击中...`);
                    btn.click();
                    return true;
                }
            }
            
            // 方法2: 查找所有带有"退出"文本的全屏相关元素
            const allElements = document.querySelectorAll('*');
            for (let el of allElements) {
                if ((el.textContent.includes('退出') || el.textContent.includes('Exit')) && 
                    (el.textContent.includes('全屏') || el.textContent.includes('fullscreen')) &&
                    el.offsetParent !== null) {
                    const clickable = el.closest('a, button, [role="button"]');
                    if (clickable) {
                        appLogger.debug('✅ [全屏] 通过文本查找到退出全屏按钮，点击中...');
                        clickable.click();
                        return true;
                    }
                }
            }
            
            // 方法3: 调用页面的fullScreen函数再次切换
            if (typeof window.fullScreen === 'function') {
                appLogger.debug('✅ [全屏] 再次调用 fullScreen() 切换');
                window.fullScreen();
                return true;
            }
            
            // 方法4: ESC键退出全屏
            const escapeEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(escapeEvent);
            appLogger.debug('✅ [全屏] 发送 ESC 事件');
            return true;
        } catch (error) {
            appLogger.error('❌ [全屏] 退出全屏时出错:', error);
            return true; // 继续截图，即使退出失败
        }
    };
    
    // 等待元素加载
    window.waitForElement = function(selector, timeout = 3000) {
        return new Promise((resolve) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
            
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    // ==========================================
    // 1. 消息处理
    // ==========================================
    
    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        try {
            appLogger.debug('📨 [Content] 收到消息:', request.action);
            
            if (request.action === 'enterFullScreen') {
                const result = window.enterFullScreen();
                setTimeout(() => {
                    sendResponse({ success: result });
                }, 500); // 等待全屏动画完成
                return true; // 异步响应
            }
            
            if (request.action === 'exitFullScreen') {
                const result = window.exitFullScreen();
                setTimeout(() => {
                    sendResponse({ success: result });
                }, 500);
                return true;
            }
            
            if (request.action === 'waitContent') {
                sendResponse({ ready: true });
            }
            
            // 从popup触发的操作
            if (request.action === 'triggerAutoGrading') {
                appLogger.info('🎯 [Popup] 触发自动批改');
                (async () => {
                    try {
                        await startAutoGradingFlow();
                        sendResponse({ success: true, message: '自动批改已启动' });
                    } catch (error) {
                        appLogger.error('❌ [Popup] 自动批改失败:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                })();
                return true; // 异步响应
            }
            
            if (request.action === 'triggerHomeworkAnalysis') {
                appLogger.info('🔍 [Popup] 触发作业分析');
                (async () => {
                    try {
                        await startHomeworkAnalysis();
                        sendResponse({ success: true, message: 'AI作业分析已启动' });
                    } catch (error) {
                        appLogger.error('❌ [Popup] 作业分析失败:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                })();
                return true;
            }
            
            if (request.action === 'triggerOneClickRemind') {
                appLogger.info('📢 [Popup] 触发一键催交');
                (async () => {
                    try {
                        await startOneClickRemind();
                        sendResponse({ success: true, message: '一键催交已启动' });
                    } catch (error) {
                        appLogger.error('❌ [Popup] 一键催交失败:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                })();
                return true;
            }
            
            if (request.action === 'triggerManualCriteria') {
                appLogger.info('✏️ [Popup] 打开手动设置');
                try {
                    openManualCriteriaEditor();
                    sendResponse({ success: true, message: '已打开手动设置面板' });
                } catch (error) {
                    appLogger.error('❌ [Popup] 打开手动设置失败:', error);
                    sendResponse({ success: false, error: error.message });
                }
                return false;
            }
            
            if (request.action === 'triggerSingleStudent') {
                appLogger.info('👤 [Popup] 触发单人批改:', request.studentName);
                const studentName = request.studentName;
                if (!studentName) {
                    sendResponse({ success: false, error: '请输入学生姓名' });
                    return false;
                }
                (async () => {
                    try {
                        await startSingleStudentGrading(studentName);
                        sendResponse({ success: true, message: `已开始批改学生: ${studentName}` });
                    } catch (error) {
                        appLogger.error('❌ [Popup] 单人批改失败:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                })();
                return true;
            }
            
            if (request.action === 'toggleIncludeReviewed') {
                appLogger.debug('🔄 [Popup] 切换重新批阅选项:', request.value);
                AUTO_GRADING_STATE.includeReviewedSubmissions = request.value;
                sendResponse({ success: true, value: AUTO_GRADING_STATE.includeReviewedSubmissions });
                return false;
            }

            if (request.action === 'toggleRuleBreakdown') {
                appLogger.debug('🔄 [Popup] 切换规则评分明细显示:', request.value);
                AUTO_GRADING_STATE.showRuleScoringBreakdown = request.value !== false;
                persistRuleBreakdownSetting(AUTO_GRADING_STATE.showRuleScoringBreakdown);
                sendResponse({ success: true, value: AUTO_GRADING_STATE.showRuleScoringBreakdown });
                return false;
            }

            if (request.action === 'getExtensionSettings') {
                sendResponse({
                    success: true,
                    includeReviewedSubmissions: AUTO_GRADING_STATE.includeReviewedSubmissions,
                    showRuleScoringBreakdown: AUTO_GRADING_STATE.showRuleScoringBreakdown
                });
                return false;
            }
            
            if (request.action === 'getGradingStatus') {
                sendResponse({ 
                    success: true, 
                    isRunning: AUTO_GRADING_STATE.isRunning,
                    isPaused: AUTO_GRADING_STATE.isPaused,
                    currentStudentIndex: AUTO_GRADING_STATE.currentStudentIndex,
                    totalStudents: AUTO_GRADING_STATE.totalStudents
                });
                return false;
            }
            
            if (request.action === 'getStudentNameList') {
                appLogger.debug('📋 [Popup] 获取学生姓名列表');
                (async () => {
                    try {
                        const studentList = await detectStudentList();
                        const nameList = studentList.map(s => s.name);
                        appLogger.debug(`✅ [Popup] 获取到 ${nameList.length} 个学生姓名:`, nameList);
                        sendResponse({ success: true, nameList: nameList });
                    } catch (error) {
                        appLogger.error('❌ [Popup] 获取学生名单失败:', error);
                        sendResponse({ success: false, error: error.message, nameList: [] });
                    }
                })();
                return true;
            }
            
        } catch (error) {
            appLogger.error('❌ [Content] 消息处理出错:', error);
            sendResponse({ success: false, error: error.message });
        }
    });

    // ==========================================
    // 2. 样式注入
    // ==========================================
    function injectStyles(){
        if (document.getElementById('zhihuishu-ai-styles')) return;
        const s = document.createElement('style'); 
        s.id = 'zhihuishu-ai-styles';
        s.textContent = `
            /* 悬浮球 - 两个豆豆眼 */
            .zh-floating-ball {
                position: fixed;
                top: 50%;
                right: 20px;
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: radial-gradient(circle at 30% 28%, #f8f8f8 0%, #ececec 58%, #dfdfdf 100%);
                border: 1px solid #cfcfcf;
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12), inset 0 -2px 10px rgba(255, 255, 255, 0.55), inset 0 -2px 8px rgba(0, 0, 0, 0.05);
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                z-index: 2147483647;
                user-select: none;
                overflow: hidden;
                isolation: isolate;
            }
            .zh-floating-ball::before {
                content: '';
                position: absolute;
                inset: -18% -32%;
                border-radius: 50%;
                background: linear-gradient(110deg, rgba(255, 255, 255, 0) 28%, rgba(255, 255, 255, 0.2) 45%, rgba(255, 255, 255, 0.06) 58%, rgba(255, 255, 255, 0) 72%);
                pointer-events: none;
                mix-blend-mode: screen;
                opacity: 0.5;
                transform: translateX(-8px) rotate(-7deg);
                animation: zh-pearl-sheen 14s ease-in-out infinite;
            }
            .zh-floating-ball:hover {
                transform: translateY(-1px) scale(1.08);
                box-shadow: 0 14px 28px rgba(0, 0, 0, 0.16), inset 0 -2px 8px rgba(0, 0, 0, 0.08);
            }
            .zh-floating-ball.active {
                transform: scale(1.08);
            }
            .zh-floating-ball.menu-open {
                background: radial-gradient(circle at 30% 28%, #fafafa 0%, #ebebeb 52%, #d9d9d9 100%);
                box-shadow: 0 12px 24px rgba(0, 0, 0, 0.14), inset 0 -2px 10px rgba(255, 255, 255, 0.55), inset 0 -2px 8px rgba(0, 0, 0, 0.06);
            }
            @keyframes zh-pearl-sheen {
                0%,
                100% {
                    transform: translateX(-8px) rotate(-7deg);
                    opacity: 0.58;
                }
                50% {
                    transform: translateX(8px) rotate(-7deg);
                    opacity: 0.72;
                }
            }
            .zh-eye {
                width: 11px;
                height: 11px;
                background: radial-gradient(circle at 30% 30%, #4a4a4a, #303030);
                border-radius: 50%;
                position: absolute;
                top: 50%;
                transition: transform 0.08s linear;
            }
            .zh-eye-left {
                left: calc(50% - 17px);
                margin-top: -5.5px;
            }
            .zh-eye-right {
                left: calc(50% + 6px);
                margin-top: -5.5px;
            }
            .zh-eye::after {
                content: '';
                position: absolute;
                width: 3px;
                height: 3px;
                background: rgba(255, 255, 255, 0.56);
                border-radius: 50%;
                top: 2px;
                left: 2px;
            }

            /* 散开按钮 */
            .zh-action-btn {
                position: relative;
                padding: 10px 16px;
                background: #f2f2f2;
                color: #2b2b2b;
                border: 1px solid #cdcdcd;
                border-radius: 10px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
                z-index: 2147483647;
                opacity: 1;
                transform: none;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                pointer-events: auto;
                white-space: nowrap;
                user-select: none;
                min-width: 0;
                width: 100%;
                text-align: center;
            }
            .zh-action-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 9px 18px rgba(0, 0, 0, 0.1);
            }
            .zh-action-btn:active {
                transform: translateY(0);
            }
            .zh-action-btn.type-detect {
                background: #f0f0f0;
                color: #2b2b2b;
            }
            .zh-action-btn.type-auto {
                background: #f2f2f2;
                color: #2b2b2b;
            }
            .zh-action-btn.type-single {
                background: #ededed;
                color: #2b2b2b;
            }
            .zh-action-btn.type-remind {
                background: #f6f6f6;
                color: #4a4a4a;
                border: 1px solid #d2d2d2;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
            }
            .zh-action-btn.type-remind:hover {
                box-shadow: 0 8px 14px rgba(0, 0, 0, 0.08);
            }
            
            /* 独立暂停按钮 */
            .zh-pause-float-btn {
                position: fixed;
                bottom: 80px;
                right: 20px;
                padding: 12px 20px;
                background: linear-gradient(135deg, #FF9800 0%, #FF6B00 100%);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 8px 20px rgba(255, 107, 0, 0.35);
                z-index: 2147483646;
                display: none;
                transition: all 0.3s ease;
            }
            .zh-pause-float-btn.show {
                display: block;
            }
            .zh-pause-float-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 24px rgba(255, 107, 0, 0.45);
            }
            .zh-pause-float-btn.paused {
                background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
                box-shadow: 0 8px 20px rgba(76, 175, 80, 0.35);
            }
            .zh-pause-float-btn.paused:hover {
                box-shadow: 0 10px 24px rgba(76, 175, 80, 0.45);
            }

            /* 散开输入框 */
            .zh-action-input {
                position: relative;
                padding: 9px 12px;
                background: #f5f5f5;
                border: 1px solid #cfcfcf;
                border-radius: 10px;
                font-size: 13px;
                font-weight: 600;
                outline: none;
                box-shadow: none;
                z-index: 2147483647;
                opacity: 1;
                transform: none;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
                pointer-events: auto;
                width: 100%;
            }
            /* 功能菜单容器 */
            .zh-action-menu {
                position: fixed;
                display: flex;
                flex-direction: column;
                gap: 14px;
                padding: 18px 16px 16px;
                width: 380px;
                background: rgba(236, 236, 236, 0.96);
                border: 1px solid #d2d2d2;
                border-radius: 18px;
                box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(4px);
                z-index: 2147483646;
                opacity: 0;
                transform: translateY(-6px) scale(0.98);
                transition: opacity 0.2s ease, transform 0.2s ease;
                pointer-events: none;
            }
            .zh-action-menu.show {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }
            .zh-action-group {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .zh-action-group.batch {
                gap: 10px;
            }
            .zh-action-group.batch .zh-action-btn {
                flex: 1;
            }
            .zh-action-group.single {
                background: #f0f0f0;
                border-radius: 12px;
                padding: 8px;
                box-shadow: inset 0 0 0 1px #d3d3d3;
            }
            .zh-action-group.single .zh-action-input {
                flex: 1;
            }
            .zh-action-group.single .zh-action-btn {
                width: auto;
                min-width: 96px;
                padding: 9px 12px;
            }
            .zh-action-group.settings {
                background: #e9e9e9;
                border: 1px solid #d0d0d0;
                border-radius: 10px;
                padding: 10px 12px;
                margin-top: 6px;
            }
            .zh-action-group.settings input[type="checkbox"] {
                accent-color: #2a2a2a;
                cursor: pointer;
                margin: 0;
            }
            .zh-action-group.settings label {
                margin: 0 !important;
                padding: 0;
                cursor: pointer;
                font-size: 12px;
                color: #4a4a4a;
                white-space: nowrap;
            }
            .zh-action-input:focus {
                border-color: #bdbdbd;
                background: #fcfcfc;
                box-shadow: none;
            }

            /* 自动补全下拉列表 */
            .zh-autocomplete-dropdown {
                position: absolute;
                top: calc(100% + 6px);
                left: 0;
                right: 0;
                max-height: 200px;
                overflow-y: auto;
                background: #f4f4f4;
                border: 1px solid #cecece;
                border-radius: 10px;
                box-shadow: 0 8px 18px rgba(0, 0, 0, 0.1);
                z-index: 2147483648;
                display: none;
                opacity: 0;
                transform: translateY(-4px);
                transition: opacity 0.15s ease, transform 0.15s ease;
            }
            .zh-autocomplete-dropdown.show {
                display: block;
                opacity: 1;
                transform: translateY(0);
            }
            .zh-autocomplete-item {
                padding: 10px 14px;
                cursor: pointer;
                font-size: 13px;
                color: #3d3d3d;
                border-bottom: 1px solid #dddddd;
                transition: background 0.12s ease, color 0.12s ease;
            }
            .zh-autocomplete-item:last-child {
                border-bottom: none;
            }
            .zh-autocomplete-item:hover,
            .zh-autocomplete-item.active {
                background: #e9e9e9;
                color: #222;
            }
            .zh-autocomplete-empty {
                padding: 14px;
                text-align: center;
                color: #8a8a8a;
                font-size: 12px;
            }

            /* 浮动面板 */
            .zh-floating-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 420px;
                max-height: 600px;
                background: white;
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                z-index: 2147483646;
                display: flex;
                flex-direction: column;
                animation: slideIn 0.3s ease;
            }
            @keyframes slideIn {
                from { opacity: 0; transform: translate(-50%, -48%); }
                to { opacity: 1; transform: translate(-50%, -50%); }
            }

            .zh-panel-header {
                padding: 16px 20px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                user-select: none;
            }
            .zh-panel-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: #1f2937;
            }
            .zh-panel-close {
                width: 32px;
                height: 32px;
                border: none;
                background: transparent;
                cursor: pointer;
                font-size: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                transition: all 0.2s;
            }
            .zh-panel-close:hover {
                background: #f3f4f6;
            }

            .zh-panel-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }

            /* 状态环 */
            #zh-status-ring {
                display: none;
                position: absolute;
                top: -8px;
                right: -8px;
                width: 64px;
                height: 64px;
                border: 4px solid transparent;
                border-radius: 50%;
                animation: spin 2s linear infinite;
            }
            #zh-status-ring.active {
                display: block;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* 通知动画 */
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            @keyframes slideOutRight {
                from {
                    opacity: 1;
                    transform: translateX(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(100px);
                }
            }
        `;
        document.head.appendChild(s);
    }

    // ==========================================
    // 3. 浮窗球创建
    // ==========================================
    function createFloatingBall(){
        try {
            appLogger.debug('📌 [createFloatingBall] 开始创建浮窗球...');
            injectStyles();
            appLogger.debug('✅ [createFloatingBall] 样式已注入');
            
            if (document.getElementById('zhihuishu-ai-floating-ball')) {
                appLogger.debug('⚠️ [createFloatingBall] 浮窗球已存在，跳过');
                return;
            }

            const ball = document.createElement('div');
        ball.id = 'zhihuishu-ai-floating-ball';
        ball.className = 'zh-floating-ball';
        ball.title = '打开智能阅卷菜单';

        // 创建两个豆豆眼
        const leftEye = document.createElement('div');
        leftEye.className = 'zh-eye zh-eye-left';
        const rightEye = document.createElement('div');
        rightEye.className = 'zh-eye zh-eye-right';
        
        ball.appendChild(leftEye);
        ball.appendChild(rightEye);

        // 眼球追踪效果
        document.addEventListener('mousemove', (e) => {
            const rect = ball.getBoundingClientRect();
            const ballCenterX = rect.left + rect.width / 2;
            const ballCenterY = rect.top + rect.height / 2;
            const deltaX = e.clientX - ballCenterX;
            const deltaY = e.clientY - ballCenterY;
            const angle = Math.atan2(deltaY, deltaX);
            const pointerDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const moveFactor = Math.min(pointerDistance / 180, 1);
            const maxOffset = 2.2;
            const translateX = Math.cos(angle) * maxOffset * moveFactor;
            const translateY = Math.sin(angle) * maxOffset * moveFactor;
            leftEye.style.transform = `translate(${translateX}px, ${translateY}px)`;
            rightEye.style.transform = `translate(${translateX}px, ${translateY}px)`;
        });

        const ring = document.createElement('div');
        ring.id = 'zh-status-ring';
        ball.appendChild(ring);

        // 创建散开按钮 - 分两排
        // 第一排：AI分析、手动设置
        const row1Actions = [
            { id: 'analyze', text: 'AI分析', type: 'auto' },
            { id: 'manual-criteria', text: '✏️ 手动设置', type: 'remind' }
        ];
        
        // 第二排：自动批改、催交未交
        const row2Actions = [
            { id: 'auto', text: '自动批改', type: 'auto' },
            { id: 'remind', text: '催交未交', type: 'remind' }
        ];

        const actionMenu = document.createElement('div');
        actionMenu.className = 'zh-action-menu';
        document.body.appendChild(actionMenu);

        // 创建第一排按钮组
        const batchGroup1 = document.createElement('div');
        batchGroup1.className = 'zh-action-group batch';
        actionMenu.appendChild(batchGroup1);

        const actionButtons = [];
        let btnIndex = 0;
        
        row1Actions.forEach((action) => {
            const btn = document.createElement('button');
            btn.className = `zh-action-btn type-${action.type}`;
            btn.textContent = action.text;
            btn.dataset.action = action.id;
            btn.dataset.index = btnIndex++;
            batchGroup1.appendChild(btn);
            actionButtons.push(btn);
        });
        
        // 创建第二排按钮组
        const batchGroup2 = document.createElement('div');
        batchGroup2.className = 'zh-action-group batch';
        actionMenu.appendChild(batchGroup2);
        
        row2Actions.forEach((action) => {
            const btn = document.createElement('button');
            btn.className = `zh-action-btn type-${action.type}`;
            btn.textContent = action.text;
            btn.dataset.action = action.id;
            btn.dataset.index = btnIndex++;
            batchGroup2.appendChild(btn);
            actionButtons.push(btn);
        });

        // 创建单人批改输入框和按钮
        const singleInput = document.createElement('input');
        singleInput.className = 'zh-action-input';
        singleInput.placeholder = '输入学生姓名';
        singleInput.id = 'zh-single-input';
        singleInput.autocomplete = 'off';
        const singleGroup = document.createElement('div');
        singleGroup.className = 'zh-action-group single';
        singleGroup.style.position = 'relative'; // 为下拉列表提供定位基准
        actionMenu.appendChild(singleGroup);
        singleGroup.appendChild(singleInput);

        // 创建自动补全下拉列表
        const autocompleteDropdown = document.createElement('div');
        autocompleteDropdown.className = 'zh-autocomplete-dropdown';
        autocompleteDropdown.id = 'zh-autocomplete-dropdown';
        singleGroup.appendChild(autocompleteDropdown);

        // 自动补全相关变量
        let currentSuggestions = [];
        let selectedSuggestionIndex = -1;

        // 加载学生姓名缓存
        async function loadStudentNameCache() {
            if (AUTO_GRADING_STATE.studentNameCacheLoaded) {
                appLogger.debug('📋 [自动补全] 学生姓名缓存已加载，跳过');
                return;
            }
            
            appLogger.info('📋 [自动补全] 开始加载学生姓名...');
            try {
                const studentList = await detectStudentList();
                AUTO_GRADING_STATE.studentNameCache = studentList.map(s => s.name);
                AUTO_GRADING_STATE.studentNameCacheLoaded = true;
                appLogger.debug(`✅ [自动补全] 已缓存 ${AUTO_GRADING_STATE.studentNameCache.length} 个学生姓名:`, AUTO_GRADING_STATE.studentNameCache);
            } catch (error) {
                appLogger.error('❌ [自动补全] 加载学生姓名失败:', error);
                AUTO_GRADING_STATE.studentNameCache = [];
            }
        }

        // 显示自动补全建议
        function showAutocompleteSuggestions(query) {
            if (!query) {
                autocompleteDropdown.classList.remove('show');
                currentSuggestions = [];
                selectedSuggestionIndex = -1;
                return;
            }

            // 过滤匹配的学生姓名
            currentSuggestions = AUTO_GRADING_STATE.studentNameCache.filter(name => 
                name.includes(query)
            );

            if (currentSuggestions.length === 0) {
                autocompleteDropdown.innerHTML = '<div class="zh-autocomplete-empty">未找到匹配的学生</div>';
                autocompleteDropdown.classList.add('show');
                return;
            }

            // 渲染建议列表
            autocompleteDropdown.innerHTML = currentSuggestions.map((name, index) => 
                `<div class="zh-autocomplete-item" data-index="${index}">${name}</div>`
            ).join('');

            // 为每个建议项添加点击事件
            autocompleteDropdown.querySelectorAll('.zh-autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    singleInput.value = item.textContent;
                    autocompleteDropdown.classList.remove('show');
                    currentSuggestions = [];
                    selectedSuggestionIndex = -1;
                });
            });

            autocompleteDropdown.classList.add('show');
            selectedSuggestionIndex = -1;
        }

        // 输入框事件：输入时触发自动补全
        singleInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            showAutocompleteSuggestions(query);
        });

        // 输入框事件：键盘导航
        singleInput.addEventListener('keydown', (e) => {
            if (!autocompleteDropdown.classList.contains('show')) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, currentSuggestions.length - 1);
                updateSelectedSuggestion();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
                updateSelectedSuggestion();
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                if (selectedSuggestionIndex >= 0) {
                    e.preventDefault();
                    singleInput.value = currentSuggestions[selectedSuggestionIndex];
                    autocompleteDropdown.classList.remove('show');
                    currentSuggestions = [];
                    selectedSuggestionIndex = -1;
                }
            } else if (e.key === 'Escape') {
                autocompleteDropdown.classList.remove('show');
                currentSuggestions = [];
                selectedSuggestionIndex = -1;
            }
        });

        // 输入框失焦时隐藏下拉列表（延迟以允许点击）
        singleInput.addEventListener('blur', () => {
            setTimeout(() => {
                autocompleteDropdown.classList.remove('show');
                currentSuggestions = [];
                selectedSuggestionIndex = -1;
            }, 200);
        });

        // 输入框获焦时加载学生姓名缓存
        singleInput.addEventListener('focus', () => {
            if (!AUTO_GRADING_STATE.studentNameCacheLoaded) {
                loadStudentNameCache();
            }
        });

        // 更新选中的建议项高亮
        function updateSelectedSuggestion() {
            const items = autocompleteDropdown.querySelectorAll('.zh-autocomplete-item');
            items.forEach((item, index) => {
                if (index === selectedSuggestionIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    item.classList.remove('active');
                }
            });
        }

        const singleBtn = document.createElement('button');
        singleBtn.className = 'zh-action-btn type-single';
        singleBtn.textContent = '批改此人';
        singleBtn.dataset.action = 'single';
        singleBtn.dataset.index = '3';
        singleGroup.appendChild(singleBtn);
        actionButtons.push(singleBtn);

        // 创建设置选项组（重新批阅选项）
        const settingsGroup = document.createElement('div');
        settingsGroup.className = 'zh-action-group settings';
        settingsGroup.style.cssText = 'display: flex; align-items: center; padding: 10px; border-top: 1px solid #eee; gap: 8px;';
        actionMenu.appendChild(settingsGroup);

        const toggleCheckbox = document.createElement('input');
        toggleCheckbox.type = 'checkbox';
        toggleCheckbox.id = 'zh-include-reviewed-toggle';
        toggleCheckbox.checked = AUTO_GRADING_STATE.includeReviewedSubmissions;
        toggleCheckbox.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';
        
        const toggleLabel = document.createElement('label');
        toggleLabel.htmlFor = 'zh-include-reviewed-toggle';
        toggleLabel.textContent = '包括已批阅';
        toggleLabel.style.cssText = 'cursor: pointer; user-select: none; font-size: 12px; margin: 0;';
        
        settingsGroup.appendChild(toggleCheckbox);
        settingsGroup.appendChild(toggleLabel);
        
        toggleCheckbox.addEventListener('change', (e) => {
            AUTO_GRADING_STATE.includeReviewedSubmissions = e.target.checked;
            appLogger.debug(`🔄 [设置] 重新批阅已批作业: ${e.target.checked ? '启用' : '禁用'}`);
        });

        // 创建暂停/继续按钮组
        const pauseControlGroup = document.createElement('div');
        pauseControlGroup.className = 'zh-action-group batch';
        pauseControlGroup.id = 'zh-pause-control-group';
        pauseControlGroup.style.cssText = 'display: none; margin-top: 8px;';
        actionMenu.appendChild(pauseControlGroup);

        const pauseBtn = document.createElement('button');
        pauseBtn.className = 'zh-action-btn type-remind';
        pauseBtn.textContent = '⏸️ 暂停批改';
        pauseBtn.id = 'zh-pause-btn';
        pauseControlGroup.appendChild(pauseBtn);

        pauseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (AUTO_GRADING_STATE.isPaused) {
                // 继续
                AUTO_GRADING_STATE.isPaused = false;
                pauseBtn.textContent = '⏸️ 暂停批改';
                pauseBtn.className = 'zh-action-btn type-remind';
                appLogger.info('▶️ [暂停控制] 继续批改');
                showNotification('继续批改', '#4CAF50');
            } else {
                // 暂停
                AUTO_GRADING_STATE.isPaused = true;
                pauseBtn.textContent = '▶️ 继续批改';
                pauseBtn.className = 'zh-action-btn type-auto';
                appLogger.info('⏸️ [暂停控制] 已发出暂停指令，将在安全点暂停');
                showNotification('⏸️ 已暂停（当前步骤完成后生效）', '#FF9800');
            }
        });

        let menuOpen = false;

        const toggleMenu = () => {
            if (menuOpen) {
                closeActionButtons();
            } else {
                openActionButtons();
            }
        };

        const openActionButtons = () => {
            menuOpen = true;
            ball.classList.add('active');
            ball.classList.add('menu-open');
            const rect = ball.getBoundingClientRect();
            const ballLeft = rect.left;
            const ballTop = rect.top;
            const ballRight = rect.right;
            const menuWidth = 380;
            const menuHeight = 330;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const padding = 15; // 屏幕边界留白

            // ============ 水平位置计算 ============
            // 优先中心对齐，如果超出右边界则靠左对齐
            let menuLeft = ballLeft + (rect.width - menuWidth) / 2;
            
            // 检查是否超出右边界
            if (menuLeft + menuWidth > windowWidth - padding) {
                // 改为从球的左侧显示（菜单在球的左边）
                menuLeft = ballLeft - menuWidth - 10;
                
                // 如果还是超出左边界，就右对齐到球的左边界
                if (menuLeft < padding) {
                    menuLeft = ballLeft - menuWidth - 5;
                }
            }

            // ============ 垂直位置计算 ============
            // 优先显示在球的下方
            let menuTop = ballTop + rect.height - 18;
            
            // 检查是否超出下边界
            if (menuTop + menuHeight > windowHeight - padding) {
                // 改为显示在球的上方
                menuTop = ballTop - menuHeight - 10;
            }

            actionMenu.style.left = `${Math.max(padding, menuLeft)}px`;
            actionMenu.style.top = `${Math.max(padding, menuTop)}px`;
            actionMenu.style.right = 'auto';
            setTimeout(() => actionMenu.classList.add('show'), 0);
        };

        const closeActionButtons = () => {
            menuOpen = false;
            ball.classList.remove('active');
            ball.classList.remove('menu-open');
            actionMenu.classList.remove('show');
        };

        ball.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
        });

        actionButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                closeActionButtons();

                if (action === 'auto') {
                    await startAutoGradingFlow();
                } else if (action === 'remind') {
                    await startOneClickRemind();
                } else if (action === 'analyze') {
                    await startHomeworkAnalysis();
                } else if (action === 'manual-criteria') {
                    openManualCriteriaEditor();
                } else if (action === 'single') {
                    const name = singleInput.value.trim();
                    if (!name) {
                        alert('请输入学生姓名');
                        singleInput.classList.add('show');
                        singleInput.focus();
                        return;
                    }
                    await startSingleStudentGrading(name);
                    singleInput.value = '';
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!menuOpen) return;
            if (ball.contains(e.target)) return;
            if (actionMenu.contains(e.target)) return;
            if (actionButtons.some(btn => btn.contains(e.target))) return;
            if (singleInput.contains(e.target)) return;
            closeActionButtons();
        });

        // 拖拽
        makeDraggable(ball);
        document.body.appendChild(ball);
        
        const ballRect = document.getElementById('zhihuishu-ai-floating-ball');
        if (ballRect) {
            appLogger.info('✅ [createFloatingBall] 浮窗球已成功创建并添加到页面');
            appLogger.debug('✅ [createFloatingBall] 浮窗球位置信息:', ballRect.getBoundingClientRect());
        } else {
            appLogger.error('❌ [createFloatingBall] 浮窗球创建失败');
        }
        
        } catch (error) {
            appLogger.error('❌ [createFloatingBall] 创建浮窗球时出错:', error);
            appLogger.debug('❌ [createFloatingBall] 错误堆栈:', error.stack);
        }
    }

    function makeDraggable(el) {
        let dragging = false, startX, startY, initialX, initialY;
        
        el.addEventListener('mousedown', (e) => {
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            el.style.transition = 'none';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const newX = initialX + (e.clientX - startX);
            const newY = initialY + (e.clientY - startY);
            el.style.left = newX + 'px';
            el.style.top = newY + 'px';
            el.style.right = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            dragging = false;
            el.style.transition = 'all 0.3s ease';
        });
    }

    // ==========================================
    // 4. 动画效果
    // ==========================================
    function animateRingStart(color) {
        const ring = document.getElementById('zh-status-ring');
        if (ring) {
            ring.classList.add('active');
            ring.style.borderTopColor = color;
            ring.style.borderRightColor = color;
            ring.style.borderBottomColor = 'transparent';
            ring.style.borderLeftColor = 'transparent';
        }
    }

    function animateRingStop() {
        const ring = document.getElementById('zh-status-ring');
        if (ring) {
            ring.classList.remove('active');
        }
    }

    const UI_STYLE_TEMPLATES = {
        floatingPanelHeader: (color) => `background: linear-gradient(135deg, ${color}20 0%, ${color}10 100%);`,
        floatingPanelTitle: (color) => `color: ${color};`,
        notificationBase: (color) => `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${color};
            color: white;
            padding: 12px 16px;
            border-radius: 10px;
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.25);
            z-index: 2147483647;
            font-size: 14px;
            font-weight: 600;
            animation: slideInRight 0.25s ease;
        `
    };

    const REMIND_PANEL_STYLE_TEMPLATES = {
        wrapper: 'text-align:center; padding:20px;',
        icon: 'font-size:36px; margin-bottom:12px;',
        title: 'margin:0 0 12px 0;',
        progressText: 'font-size:14px; color:#666;',
        barTrack: 'width:200px; height:6px; background:#e0e0e0; border-radius:3px; margin:16px auto; overflow:hidden;',
        bar: 'width:0%; height:100%; background:#FF6B6B; transition: width 0.3s ease;'
    };

    const AUTO_GRADE_PANEL_STYLE_TEMPLATES = {
        wrapper: 'text-align:center; padding:20px;',
        icon: 'font-size:36px; margin-bottom:12px;',
        title: 'margin:0 0 12px 0;',
        progressText: 'font-size:14px; color:#666;',
        pageFeedback: 'font-size:12px; color:#8a8a8a; margin-top:6px;',
        barTrack: 'width:200px; height:6px; background:#e0e0e0; border-radius:3px; margin:16px auto; overflow:hidden;',
        bar: 'width:0%; height:100%; background:#FF6B6B; transition: width 0.3s ease;',
        progressColorNormal: '#666',
        progressColorPaused: '#FF9800',
        pageFeedbackColorPending: '#8a8a8a',
        pageFeedbackColorOk: '#2f6f3d',
        pageFeedbackColorWarn: '#b45309'
    };

    function buildRemindProgressPanelHTML() {
        return `
            <div style="${REMIND_PANEL_STYLE_TEMPLATES.wrapper}">
                <div style="${REMIND_PANEL_STYLE_TEMPLATES.icon}">📢</div>
                <h3 style="${REMIND_PANEL_STYLE_TEMPLATES.title}">正在批量催交</h3>
                <p id="zh-remind-progress" style="${REMIND_PANEL_STYLE_TEMPLATES.progressText}">准备开始...</p>
                <div style="${REMIND_PANEL_STYLE_TEMPLATES.barTrack}">
                    <div id="zh-remind-bar" style="${REMIND_PANEL_STYLE_TEMPLATES.bar}"></div>
                </div>
            </div>
        `;
    }

    function buildAutoGradeProgressPanelHTML() {
        return `
            <div style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.wrapper}">
                <div style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.icon}">⏳</div>
                <h3 style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.title}">自动批改中</h3>
                <p id="zh-auto-grade-progress" style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.progressText}">准备开始...</p>
                <p id="zh-page-feedback" style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.pageFeedback}">分页反馈：待开始</p>
                <div style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.barTrack}">
                    <div id="zh-auto-grade-bar" style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.bar}"></div>
                </div>
            </div>
        `;
    }

    function updatePageFeedback(text, type = 'pending') {
        const pageFeedbackEl = document.getElementById('zh-page-feedback');
        if (!pageFeedbackEl) return;

        pageFeedbackEl.textContent = text;
        if (type === 'ok') {
            pageFeedbackEl.style.color = AUTO_GRADE_PANEL_STYLE_TEMPLATES.pageFeedbackColorOk;
        } else if (type === 'warn') {
            pageFeedbackEl.style.color = AUTO_GRADE_PANEL_STYLE_TEMPLATES.pageFeedbackColorWarn;
        } else {
            pageFeedbackEl.style.color = AUTO_GRADE_PANEL_STYLE_TEMPLATES.pageFeedbackColorPending;
        }
    }

    // ==========================================
    // 5. 浮动面板
    // ==========================================
    function showFloatingPanel(title, color, contentHTML) {
        closePanelIfExists();
        
        const panel = document.createElement('div');
        panel.id = 'zh-floating-panel';
        panel.className = 'zh-floating-panel';
        panel.style.backgroundColor = '#fff';

        panel.innerHTML = `
            <div class="zh-panel-header" style="${UI_STYLE_TEMPLATES.floatingPanelHeader(color)}">
                <h3 style="${UI_STYLE_TEMPLATES.floatingPanelTitle(color)}">🎯 ${title}</h3>
                <button class="zh-panel-close" id="zh-panel-close-btn">✕</button>
            </div>
            <div id="zh-panel-body" class="zh-panel-body">${contentHTML}</div>
        `;

        document.body.appendChild(panel);
        
        // 添加关闭按钮事件监听器
        const closeBtn = panel.querySelector('#zh-panel-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel.remove();
            });
        }
        
        makeDraggable(panel.querySelector('.zh-panel-header'));
    }

    function closePanelIfExists() {
        const existing = document.getElementById('zh-floating-panel');
        if (existing) existing.remove();
    }

    function updatePanelBody(html) {
        const body = document.getElementById('zh-panel-body');
        if (body) body.innerHTML = html;
    }

    // 显示通知提示
    function showNotification(message, color) {
        const notification = document.createElement('div');
        notification.style.cssText = UI_STYLE_TEMPLATES.notificationBase(color);
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.25s ease';
            setTimeout(() => notification.remove(), 260);
        }, 2000);
    }

    // ==========================================
    // 6. 学生列表自动导航和自动批改
    // ==========================================
    
    // 检测并提取学生列表信息（支持分页）
    async function detectStudentList() {
        appLogger.info('🔍 [自动批改] 开始检测学生列表...');
        
        const allStudents = [];

        // 先回到第一页，避免从中间页开始扫描
        await goToPage(1);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 1. 先获取总学生数
        const totalCount = getTotalStudentCount();
        appLogger.debug(`📊 [自动批改] 总学生数: ${totalCount}`);
        
        // 2. 检测总页数
        const totalPages = getTotalPages();
        appLogger.debug(`📄 [自动批改] 总页数: ${totalPages}`);
        
        // 3. 遍历每一页
        for (let page = 1; page <= totalPages; page++) {
            appLogger.debug(`\n📖 [自动批改] 正在扫描第 ${page} 页...`);
            
            // 如果不是第一页，需要点击翻页
            if (page > 1) {
                await goToPage(page);
                await new Promise(resolve => setTimeout(resolve, 1500)); // 等待页面加载
            }
            
            // 提取当前页的学生
            const studentsOnPage = extractStudentsFromCurrentPage();
            allStudents.push(...studentsOnPage);
            
            appLogger.debug(`✅ [自动批改] 第 ${page} 页找到 ${studentsOnPage.length} 个学生`);
        }
        
        appLogger.info(`\n🎉 [自动批改] 扫描完成！共找到 ${allStudents.length} 个学生`);

        // 扫描完成后回到第一页，保持初始状态
        await goToPage(1);
        await new Promise(resolve => setTimeout(resolve, 1500));

        return allStudents;
    }

    // 获取学生总数
    function getTotalStudentCount() {
        // 从 "全部(36)" 中提取数字
        const allText = document.body.textContent;
        const match = allText.match(/全部[（(](\d+)[）)]/);
        if (match) {
            return parseInt(match[1]);
        }
        
        // 备选：从 "共 36 条" 提取
        const match2 = allText.match(/共\s*(\d+)\s*条/);
        if (match2) {
            return parseInt(match2[1]);
        }
        
        return 0;
    }
    
    // 获取总页数
    function getTotalPages() {
        const pagers = document.querySelectorAll('.el-pager .number');
        if (pagers.length > 0) {
            // 找到最大页码
            let maxPage = 1;
            for (let pager of pagers) {
                const pageNum = parseInt(pager.textContent.trim());
                if (pageNum > maxPage) {
                    maxPage = pageNum;
                }
            }
            return maxPage;
        }
        return 1; // 默认至少1页
    }
    
    // 跳转到指定页
    function goToPage(pageNum) {
        return new Promise((resolve) => {
            appLogger.debug(`🔄 [自动批改] 跳转到第 ${pageNum} 页...`);
            updatePageFeedback(`分页反馈：正在跳转到第 ${pageNum} 页...`, 'pending');
            
            // 方式 1: 点击页码按钮
            const pagers = document.querySelectorAll('.el-pager .number');
            for (let pager of pagers) {
                if (pager.textContent.trim() === pageNum.toString()) {
                    pager.click();
                    appLogger.debug(`✅ [自动批改] 已点击第 ${pageNum} 页`);
                    updatePageFeedback(`分页反馈：已切换到第 ${pageNum} 页`, 'ok');
                    setTimeout(() => resolve(), 1000);
                    return;
                }
            }
            
            // 方式 2: 点击"下一页"按钮
            const nextBtn = document.querySelector('.btn-next');
            if (nextBtn && !nextBtn.disabled) {
                nextBtn.click();
                appLogger.debug(`✅ [自动批改] 已点击"下一页"`);
                updatePageFeedback('分页反馈：已点击下一页', 'ok');
                setTimeout(() => resolve(), 1000);
                return;
            }
            
            // 方式 3: 输入页码跳转
            const pageInput = document.querySelector('.el-pagination__editor input');
            if (pageInput) {
                pageInput.value = pageNum;
                pageInput.dispatchEvent(new Event('input', { bubbles: true }));
                pageInput.dispatchEvent(new Event('change', { bubbles: true }));
                pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                appLogger.debug(`✅ [自动批改] 已输入页码 ${pageNum}`);
                updatePageFeedback(`分页反馈：已输入页码 ${pageNum}`, 'ok');
                setTimeout(() => resolve(), 1000);
                return;
            }
            
            appLogger.warn(`⚠️ [自动批改] 无法跳转到第 ${pageNum} 页`);
            updatePageFeedback(`分页反馈：无法跳转到第 ${pageNum} 页`, 'warn');
            resolve();
        });
    }
    
    // 从当前页面提取学生信息
    function extractStudentsFromCurrentPage() {
        const studentList = [];
        
        // 尝试多个选择器来找到学生行
        let rows = document.querySelectorAll('tbody tr.el-table__row');
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('table tbody tr');
        }
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('[class*="el-table__row"]');
        }
        
        if (rows.length === 0) {
            appLogger.warn('❌ [学生列表提取] 无法找到任何表格行');
            return studentList;
        }
        
        appLogger.debug(`📋 [学生列表提取] 找到 ${rows.length} 行数据`);
        
        rows.forEach((row, index) => {
            try {
                const tds = row.querySelectorAll('td');
                
                if (tds.length < 4) {
                    appLogger.warn(`⚠️ [学生列表提取] 第 ${index} 行列数不足 (${tds.length})`);
                    return;
                }
                
                // Polymas 平台布局 - 列索引
                // [0]: 勾选框
                // [1]: 姓名 (el-table_1_column_2)
                // [2]: 学号 (el-table_1_column_3)
                // [3]: 完成时间 (el-table_1_column_4)
                // [4]: 批阅状态 (el-table_1_column_5)
                // [5]: 成绩 (el-table_1_column_6)
                // [6]: 发布状态 (el-table_1_column_7)
                // [7]: 操作 (el-table_1_column_8)
                
                // 1. 提取学生名字（第2列）
                let studentName = '';
                const nameCell = tds[1];
                if (nameCell) {
                    // 从 student-info-box 中提取文本
                    const nameEl = nameCell.querySelector('[data-v-3980a020]');
                    if (nameEl) {
                        studentName = nameEl.textContent.trim();
                    }
                    // 降级方案
                    if (!studentName) {
                        studentName = nameCell.innerText?.trim() || nameCell.textContent?.trim() || '';
                    }
                }
                
                if (!studentName || studentName.length === 0) {
                    appLogger.warn(`⚠️ [学生列表提取] 第 ${index} 行无法提取名字，跳过`);
                    return;
                }
                
                appLogger.debug(`📝 [学生列表提取] [${index}] 名字: ${studentName}`);
                
                // 2. 提取学号（第3列）
                let studentId = tds[2]?.textContent?.trim() || '';
                
                // 3. 提取完成时间（第4列）
                let completionTime = tds[3]?.textContent?.trim() || '';
                
                // 4. 提取批阅状态（第5列）
                let status = tds[4]?.textContent?.trim() || '未知';
                
                // 判断是否已提交：不仅要有完成时间，还要状态不包含"未提交"
                const hasSubmission = (completionTime && completionTime !== '-' && completionTime !== '—' && completionTime !== '<!---->-') 
                    && !status.includes('未提交');
                
                // 5. 获取操作按钮（第8列或最后一列）
                let actionBtn = null;
                
                // 首先尝试第8列（index 7）
                if (tds[7]) {
                    const btn = tds[7].querySelector('.base-button-component, .primary, .is-link');
                    if (btn) {
                        actionBtn = btn;
                        appLogger.debug(`✅ [学生列表提取] [${index}] 从第8列找到操作按钮`);
                    }
                }
                
                // 如果没找到，尝试最后一列
                if (!actionBtn && tds.length > 0) {
                    const lastCell = tds[tds.length - 1];
                    const btn = lastCell.querySelector('div[class*="button"], button, [class*="base-button"]');
                    if (btn) {
                        actionBtn = btn;
                        appLogger.debug(`✅ [学生列表提取] [${index}] 从最后一列找到操作按钮`);
                    }
                }
                
                // 如果还没找到，遍历所有td寻找按钮
                if (!actionBtn) {
                    for (let i = tds.length - 1; i >= Math.max(0, tds.length - 3); i--) {
                        const btn = tds[i].querySelector('[class*="button"], [class*="base"], button');
                        if (btn && btn.textContent.includes('批阅') || btn.textContent.includes('催交')) {
                            actionBtn = btn;
                            appLogger.debug(`✅ [学生列表提取] [${index}] 从第${i}列找到操作按钮`);
                            break;
                        }
                    }
                }
                
                if (!actionBtn) {
                    appLogger.warn(`⚠️ [学生列表提取] 第 ${index} 行 (${studentName}) 无法找到操作按钮，跳过`);
                    appLogger.debug(`   行HTML: ${row.innerHTML.substring(0, 200)}...`);
                    return;
                }
                
                // ============ 关键：未提交的学生直接跳过，不添加到列表 ============
                if (!hasSubmission) {
                    appLogger.debug(`⏭️ [学生列表提取] [${index}] ${studentName} (${studentId}) - 状态: ${status}，未提交，跳过`);
                    return;
                }
                
                appLogger.debug(`✅ [学生列表提取] [${index}] ${studentName} (${studentId}) - 状态: ${status}`);
                
                studentList.push({
                    name: studentName,
                    studentId: studentId || 'N/A',
                    completionTime: completionTime || 'N/A',
                    status: status,
                    hasSubmission: hasSubmission,
                    actionBtn: actionBtn,
                    row: row
                });
                
            } catch (error) {
                appLogger.warn(`⚠️ [学生列表提取] 第 ${index} 行处理出错:`, error.message);
            }
        });
        
        appLogger.debug(`📊 [学生列表提取] 成功提取 ${studentList.length}/${rows.length} 个学生`);
        return studentList;
    }
    
    // 自动点击学生进入批改界面
    function clickStudentToEnter(student) {
        return new Promise((resolve) => {
            appLogger.debug(`🖱️ [自动批改] 点击学生: ${student.name}`);
            
            try {
                // 先关闭可能存在的弹窗
                autoCloseIntrruptDialogs();
                
                // 高亮显示要点击的学生
                student.row.style.backgroundColor = '#FFF59D';
                
                // 滚动到元素可见位置
                student.row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 等待滚动完成后点击
                setTimeout(() => {
                    appLogger.debug(`🖱️ [自动批改] 真正点击 ${student.name} 的操作按钮`);
                    student.actionBtn.click();
                    
                    // 等待页面加载完毕（3秒保证页面完全加载）
                    setTimeout(() => {
                        // 页面加载后再次检查弹窗
                        autoCloseIntrruptDialogs();
                        
                        appLogger.debug(`✅ [自动批改] ${student.name} 的作答界面已加载`);
                        resolve();
                    }, 3000);
                }, 300);
            } catch (error) {
                appLogger.error(`❌ [自动批改] 点击学生 ${student.name} 失败:`, error);
                setTimeout(() => resolve(), 2000);
            }
        });
    }
    
    // 检测评分输入框
    function findScoreInput() {
        appLogger.debug('🔍 [自动批改] 查找评分输入框...');
        
        // ============ 方案1：查找包含"请输入成绩"或"成绩"的input ============
        let inputs = document.querySelectorAll('input[placeholder*="成绩"], input[placeholder*="分数"]');
        if (inputs.length > 0) {
            appLogger.debug('✅ [自动批改] 通过placeholder找到评分输入框');
            return inputs[0];
        }
        
        // ============ 方案2：查找 el-input__inner 类的input（Element UI风格） ============
        inputs = document.querySelectorAll('input.el-input__inner[type="text"]');
        if (inputs.length > 0) {
            // 过滤掉搜索框等其他input
            for (let input of inputs) {
                const placeholder = input.getAttribute('placeholder') || '';
                if (placeholder.includes('成绩') || placeholder.includes('分') || placeholder.includes('输入')) {
                    appLogger.debug('✅ [自动批改] 通过el-input__inner找到评分输入框');
                    return input;
                }
            }
            // 如果没有合适的placeholder，取第一个
            appLogger.debug('✅ [自动批改] 找到el-input__inner，假设为评分框');
            return inputs[0];
        }
        
        // ============ 方案3：通过"本题得分"标签定位 ============
        const labels = document.querySelectorAll('p, span, label');
        for (let label of labels) {
            const text = (label.textContent || '').trim();
            if (text.includes('本题得分') || text.includes('得分')) {
                // 向下查找最近的input
                let parent = label.closest('.el-input, .el-form-item, [class*="score"]');
                if (!parent) {
                    // 向上查找父容器，然后在其中查找input
                    parent = label.closest('div');
                    let counter = 0;
                    while (parent && counter < 5) {
                        const input = parent.querySelector('input[type="text"]');
                        if (input) {
                            appLogger.debug('✅ [自动批改] 通过标签定位找到评分输入框');
                            return input;
                        }
                        parent = parent.parentElement;
                        counter++;
                    }
                }
            }
        }
        
        // ============ 方案4：从所有input中推断（电脑页面通常先是评分，后是评语） ============
        const allInputs = document.querySelectorAll('input[type="text"]');
        const allTextareas = document.querySelectorAll('textarea');
        
        // 如果只有一个input且有textarea，这个input很可能是评分框
        if (allInputs.length === 1 && allTextareas.length > 0) {
            appLogger.debug('✅ [自动批改] 唯一的input推断为评分框');
            return allInputs[0];
        }
        
        // 如果有多个input，评分框通常在评语textarea之前
        if (allInputs.length > 0) {
            // 返回第一个text input（通常是评分）
            appLogger.debug('✅ [自动批改] 返回第一个input作为评分框');
            return allInputs[0];
        }
        
        appLogger.warn('⚠️ [自动批改] 未找到评分输入框');
        return null;
    }
    
    // 检测评语输入框
    function findCommentInput() {
        appLogger.debug('🔍 [自动批改] 查找评语输入框...');
        
        // ============ 方案1：查找textarea（最直接） ============
        let textareas = document.querySelectorAll('textarea.el-textarea__inner');
        if (textareas.length > 0) {
            appLogger.debug('✅ [自动批改] 找到评语textarea（el-textarea）');
            return textareas[0];
        }
        
        // ============ 方案2：查找所有textarea ============
        textareas = document.querySelectorAll('textarea');
        if (textareas.length > 0) {
            // 过滤掉搜索框等其他textarea
            for (let textarea of textareas) {
                const placeholder = textarea.getAttribute('placeholder') || '';
                if (placeholder.includes('评语') || placeholder.includes('备注') || placeholder.includes('老师')) {
                    appLogger.debug('✅ [自动批改] 通过placeholder找到評語textarea');
                    return textarea;
                }
            }
            // 如果没有合适的placeholder，返回第一个
            appLogger.debug('✅ [自动批改] 返回第一个textarea作为评语框');
            return textareas[0];
        }
        
        // ============ 方案3：查找 contenteditable 元素 ============
        let editables = document.querySelectorAll('[contenteditable="true"]');
        if (editables.length > 0) {
            appLogger.debug('✅ [自动批改] 找到评语contenteditable');
            return editables[0];
        }
        
        // ============ 方案4：通过"评语"标签定位 ============
        const labels = document.querySelectorAll('p, span, label, .el-textarea__wrapper');
        for (let label of labels) {
            const text = (label.textContent || '').trim();
            if (text.includes('评语') || text.includes('备注') || text.includes('总评')) {
                // 向下查找最近的textarea或输入框
                let parent = label.closest('[class*="textarea"], [class*="comment"], [class*="remark"]');
                if (!parent) {
                    parent = label.closest('div');
                }
                
                if (parent) {
                    let textarea = parent.querySelector('textarea');
                    if (textarea) {
                        appLogger.debug('✅ [自动批改] 通过标签定位找到评语textarea');
                        return textarea;
                    }
                    
                    let editable = parent.querySelector('[contenteditable="true"]');
                    if (editable) {
                        appLogger.debug('✅ [自动批改] 通过标签定位找到评语contenteditable');
                        return editable;
                    }
                }
            }
        }
        
        // ============ 方案5：查找整个批改面板的textarea ============
        const correctPanel = document.querySelector('.correct-right, [class*="correct"]');
        if (correctPanel) {
            let textarea = correctPanel.querySelector('textarea');
            if (textarea) {
                appLogger.debug('✅ [自动批改] 从批改面板找到评语textarea');
                return textarea;
            }
        }
        
        appLogger.warn('⚠️ [自动批改] 未找到评语输入框');
        return null;
    }
    
    // 自动填充评分和评语
    function autoFillGradeAndComment(score, comment) {
        appLogger.debug(`📝 [自动批改] 开始填充：分数=${score}，评语=${comment}`);
        
        // 填充评分
        const scoreInput = findScoreInput();
        if (scoreInput) {
            // 设置value属性（用于可能的Vue绑定）
            scoreInput.value = String(score);
            
            // 触发 input 和 change 事件以让Vue捕获变化
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            appLogger.debug(`✅ [自动批改] 评分已填充: ${score}`);
        } else {
            appLogger.warn('⚠️ [自动批改] 无法位置评分输入框');
        }
        
        // 填充评语
        if (comment) {
            const commentInput = findCommentInput();
            if (commentInput) {
                commentInput.value = comment;
                commentInput.textContent = comment;
                
                // 触发事件
                commentInput.dispatchEvent(new Event('input', { bubbles: true }));
                commentInput.dispatchEvent(new Event('change', { bubbles: true }));
                commentInput.dispatchEvent(new Event('blur', { bubbles: true }));
                
                appLogger.debug(`✅ [自动批改] 评语已填充`);
            } else {
                appLogger.warn('⚠️ [自动批改] 无法找到评语输入框');
            }
        }
    }

    // ==========================================
    // 7.作业类型检测与对应批改策略
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

    // 各题型默认评分标准配置
    const GRADING_CRITERIA_CONFIG = {
        [HOMEWORK_TYPES.VOCAB_CHOICE]: {
            label: '词汇选择题',
            noComment: true,  // 词汇选择题不写评语
            scoreMethod: 'exact',  // 精确匹配
            criteria: ['答案正确性'],
            weights: [100]
        },
        [HOMEWORK_TYPES.READING_CHOICE]: {
            label: '阅读理解选择题',
            scoreMethod: 'exact',
            criteria: ['答案正确性'],
            weights: [100],
            commentFocus: 'reading_analysis',  // 评语重点：分析错题类型（细节/主旨/态度）
            commentTemplate: '根据常错题型分析：细节信息题/主旨大意题/情感态度题'
        },
        [HOMEWORK_TYPES.READING_SHORT]: {
            label: '阅读理解简答题',
            scoreMethod: 'keyword_match',  // 关键词+句意匹配
            criteria: ['关键词包含', '句意相符', '拼写正确', '词性正确', '大小写正确', '格式规范（首字母大写、句号）'],
            weights: [40, 30, 10, 10, 5, 5],
            deductions: {
                spelling: -1,        // 单词拼写错误扣1分
                wordForm: -1,        // 词性错误扣1分
                capitalization: -0.5, // 大小写错误扣0.5分
                firstCapital: -0.5,  // 首字母未大写扣0.5分
                noPeriod: -0.5       // 句末没有句号扣0.5分
            },
            maxWords: 10  // 答案字数≤10个单词
        },
        [HOMEWORK_TYPES.SENTENCE_REWRITE]: {
            label: '句子改写',
            scoreMethod: 'ai_rubric',
            criteria: ['句意保持（改写后句意未变）', '句式结构正确'],
            weights: [50, 50],
            deductions: {
                firstCapital: -0.5,
                noPeriod: -0.5
            }
        },
        [HOMEWORK_TYPES.SENTENCE_COMBINE]: {
            label: '句子合并',
            scoreMethod: 'ai_rubric',
            criteria: ['逻辑合理', '句意完整', '句式结构正确'],
            weights: [40, 30, 30],
            deductions: {
                firstCapital: -0.5,
                noPeriod: -0.5
            }
        },
        [HOMEWORK_TYPES.PARAGRAPH_REWRITE]: {
            label: '段落改写',
            scoreMethod: 'ai_rubric',
            criteria: ['段落大意保持', '句式多样性（简单句、复合句、复杂句）', '段落结构合理', '衔接连贯', '格式规范'],
            weights: [30, 20, 20, 20, 10]
        },
        [HOMEWORK_TYPES.SHORT_ESSAY]: {
            label: '短文写作',
            scoreMethod: 'ai_rubric',
            criteria: ['主旨大意清晰', '内容充实', '结构合理', '语言准确、词汇与句式丰富', '格式规范'],
            weights: [30, 30, 10, 20, 10]
        },
        [HOMEWORK_TYPES.TEM4_WRITING]: {
            label: '专四写作练习',
            scoreMethod: 'ai_rubric',
            criteria: ['内容切题、思想表达清楚', '文章结构严谨、层次分明', '语言流畅、用词得体', '语法正确、句型多变'],
            weights: [25, 25, 25, 25]
        },
        [HOMEWORK_TYPES.MULTIMODAL]: {
            label: '多模态作品',
            scoreMethod: 'ai_rubric',
            criteria: ['多模态协同表达效果', '内容质量与创意', '技术运用与呈现', '整体传播效果'],
            weights: [30, 30, 20, 20]
        }
    };

    // 主观题分数范围限制（75-95分）
    const SUBJECTIVE_SCORE_RANGE = { min: 75, max: 95 };
    // 主观题类型列表
    const SUBJECTIVE_TYPES = [
        HOMEWORK_TYPES.SENTENCE_REWRITE,
        HOMEWORK_TYPES.SENTENCE_COMBINE,
        HOMEWORK_TYPES.PARAGRAPH_REWRITE,
        HOMEWORK_TYPES.SHORT_ESSAY,
        HOMEWORK_TYPES.TEM4_WRITING,
        HOMEWORK_TYPES.MULTIMODAL
    ];

    // 判断是否为选择题类型
    function isChoiceType(type) {
        return type === HOMEWORK_TYPES.VOCAB_CHOICE || type === HOMEWORK_TYPES.READING_CHOICE;
    }

    // 判断是否为主观题类型（分数需控制在75-95之间）
    function isSubjectiveType(type) {
        return SUBJECTIVE_TYPES.includes(type);
    }

    // 将分数限制在主观题范围内
    function clampSubjectiveScore(score, type) {
        if (isSubjectiveType(type)) {
            return Math.max(SUBJECTIVE_SCORE_RANGE.min, Math.min(SUBJECTIVE_SCORE_RANGE.max, score));
        }
        return score;
    }

    function applyWritingMechanicsDeductions(score, text, deductions = {}, detailCollector = null) {
        if (!text || typeof text !== 'string') return score;

        let adjusted = score;
        const trimmed = text.trim();
        const hasEnglish = /[A-Za-z]/.test(trimmed);

        if (hasEnglish && deductions.firstCapital) {
            const firstLetterMatch = trimmed.match(/[A-Za-z]/);
            if (firstLetterMatch && firstLetterMatch[0] !== firstLetterMatch[0].toUpperCase()) {
                adjusted += deductions.firstCapital;
                if (Array.isArray(detailCollector)) {
                    detailCollector.push({ label: '首字母大写', delta: deductions.firstCapital, note: '首个英文单词未大写' });
                }
            }
        }

        if (deductions.noPeriod) {
            const hasEndingPunctuation = /[.!?。！？]$/.test(trimmed);
            if (!hasEndingPunctuation) {
                adjusted += deductions.noPeriod;
                if (Array.isArray(detailCollector)) {
                    detailCollector.push({ label: '句末标点', delta: deductions.noPeriod, note: '句末缺少句号或结束标点' });
                }
            }
        }

        return adjusted;
    }

    function applyTypeSpecificScoreRules(score, homeworkType, studentAnswer, detailCollector = null) {
        const config = GRADING_CRITERIA_CONFIG[homeworkType];
        if (!config) return Math.round(score);

        let adjusted = score;

        if (homeworkType === HOMEWORK_TYPES.SENTENCE_REWRITE || homeworkType === HOMEWORK_TYPES.SENTENCE_COMBINE) {
            adjusted = applyWritingMechanicsDeductions(adjusted, studentAnswer, config.deductions || {}, detailCollector);
        }

        adjusted = Math.max(0, Math.min(100, adjusted));
        adjusted = clampSubjectiveScore(adjusted, homeworkType);
        return Math.round(adjusted);
    }

    function appendRuleScoringBreakdown(comment, details) {
        if (!Array.isArray(details) || details.length === 0) return comment;

        const summary = [];
        details.slice(0, 8).forEach(item => {
            const delta = typeof item.delta === 'number' ? (item.delta > 0 ? `+${item.delta}` : `${item.delta}`) : '0';
            summary.push(`• ${item.label}：${item.value !== undefined ? item.value : ''}${item.value !== undefined ? '分' : ''} ${item.note ? `（${item.note}）` : ''}${item.value === undefined ? `（${delta}）` : ''}`.trim());
        });

        return `${comment}\n📐 规则评分明细：\n${summary.join('\n')}\n`;
    }

    // ==========================
    // 班级统计与能力曲线工具
    // ==========================
    function resetClassAnalytics() {
        CLASS_ANALYTICS.errorCounts = {};
        CLASS_ANALYTICS.aiProbabilities = [];
        CLASS_ANALYTICS.studentProgress = {};
        CLASS_ANALYTICS.badgeHits = {};
        CLASS_ANALYTICS.logicQuestions = [];
        CLASS_ANALYTICS.cultureTips = [];
        CLASS_ANALYTICS.practiceRecommendations = [];
    }

    function recordClassAnalytics(studentName, gradingResult, score, homeworkType) {
        if (!gradingResult) return;

        // AI概率
        const probability = gradingResult.aiGeneratedAnalysis?.probability;
        if (typeof probability === 'number' && !Number.isNaN(probability)) {
            CLASS_ANALYTICS.aiProbabilities.push(probability);
        }

        // 错误类别统计
        if (Array.isArray(gradingResult.commonErrorCategories)) {
            gradingResult.commonErrorCategories.forEach(item => {
                if (item?.category) {
                    const key = item.category.trim();
                    CLASS_ANALYTICS.errorCounts[key] = (CLASS_ANALYTICS.errorCounts[key] || 0) + (item.count || 1);
                }
            });
        }

        // 徽章计数
        if (Array.isArray(gradingResult.badgeCandidates)) {
            gradingResult.badgeCandidates.forEach(badge => {
                const key = badge.trim();
                if (key) {
                    CLASS_ANALYTICS.badgeHits[key] = (CLASS_ANALYTICS.badgeHits[key] || 0) + 1;
                }
            });
        }

        // 逻辑追问/文化提示/练习推荐汇总
        if (Array.isArray(gradingResult.logicQuestions)) {
            CLASS_ANALYTICS.logicQuestions.push(...gradingResult.logicQuestions.slice(0, 3));
        }
        if (Array.isArray(gradingResult.cultureTips)) {
            CLASS_ANALYTICS.cultureTips.push(...gradingResult.cultureTips.slice(0, 3));
        }
        if (Array.isArray(gradingResult.practiceRecommendations)) {
            CLASS_ANALYTICS.practiceRecommendations.push(...gradingResult.practiceRecommendations.slice(0, 3));
        }

        // 学生能力曲线
        const skills = gradingResult.skillScores || null;
        const historyItem = {
            score,
            skills,
            homeworkType,
            ts: Date.now()
        };
        if (!CLASS_ANALYTICS.studentProgress[studentName]) {
            CLASS_ANALYTICS.studentProgress[studentName] = [];
        }
        CLASS_ANALYTICS.studentProgress[studentName].push(historyItem);

        // 将历史表现持久化，便于生成长期能力曲线
        try {
            const persisted = JSON.parse(localStorage.getItem('zhai_progress') || '{}');
            if (!persisted[studentName]) persisted[studentName] = [];
            persisted[studentName].push(historyItem);
            localStorage.setItem('zhai_progress', JSON.stringify(persisted));
        } catch (e) {
            console.warn('⚠️ [统计] 写入本地历史记录失败:', e.message);
        }
    }

    function buildClassSummaryHTML() {
        const CLASS_SUMMARY_STYLE = {
            container: 'padding:12px 0; line-height:1.6;',
            heading: 'margin:12px 0 6px; color:#111827;',
            headingFirst: 'margin:4px 0 8px; color:#111827;',
            line: 'margin:4px 0; color:#111827;',
            lineTight: 'margin:2px 0; color:#111827;',
            empty: 'margin:4px 0; color:#4b5563;'
        };

        const renderHeading = (text, isFirst = false) =>
            `<h3 style="${isFirst ? CLASS_SUMMARY_STYLE.headingFirst : CLASS_SUMMARY_STYLE.heading}">${text}</h3>`;
        const renderLine = (text, tight = false) =>
            `<p style="${tight ? CLASS_SUMMARY_STYLE.lineTight : CLASS_SUMMARY_STYLE.line}">${text}</p>`;

        const errorEntries = Object.entries(CLASS_ANALYTICS.errorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const avgAIProb = CLASS_ANALYTICS.aiProbabilities.length > 0
            ? Math.round(CLASS_ANALYTICS.aiProbabilities.reduce((a, b) => a + b, 0) / CLASS_ANALYTICS.aiProbabilities.length)
            : null;

        const topBadges = Object.entries(CLASS_ANALYTICS.badgeHits)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => `${name} (${count})`);

        const logicPreview = CLASS_ANALYTICS.logicQuestions.slice(0, 3);
        const culturePreview = CLASS_ANALYTICS.cultureTips.slice(0, 3);
        const practicePreview = CLASS_ANALYTICS.practiceRecommendations.slice(0, 3);

        // 长期能力曲线提示（基于持久化数据）
        let progressSnippet = '';
        let progressDetails = [];
        try {
            const persisted = JSON.parse(localStorage.getItem('zhai_progress') || '{}');
            const studentCount = Object.keys(persisted).length;
            const totalRecords = Object.values(persisted).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
            if (studentCount > 0 && totalRecords > 0) {
                progressSnippet = `已记录 ${studentCount} 位学生的 ${totalRecords} 条作业表现，可据此绘制长期能力曲线。`;

                const deltas = [];
                Object.entries(persisted).forEach(([name, records]) => {
                    if (!Array.isArray(records) || records.length < 2) return;
                    const sorted = [...records].sort((a, b) => (a.ts || 0) - (b.ts || 0));
                    const first = sorted[0];
                    const last = sorted[sorted.length - 1];
                    if (typeof first.score === 'number' && typeof last.score === 'number') {
                        deltas.push({ name, delta: Math.round(last.score - first.score), latest: Math.round(last.score) });
                    }
                });

                const improvers = deltas
                    .filter(item => item.delta >= 5)
                    .sort((a, b) => b.delta - a.delta)
                    .slice(0, 3)
                    .map(item => `${item.name}（+${item.delta}，当前${item.latest}）`);

                const needAttention = deltas
                    .filter(item => item.delta <= -5)
                    .sort((a, b) => a.delta - b.delta)
                    .slice(0, 3)
                    .map(item => `${item.name}（${item.delta}，当前${item.latest}）`);

                if (improvers.length > 0) {
                    progressDetails.push('进步明显：' + improvers.join('；'));
                }
                if (needAttention.length > 0) {
                    progressDetails.push('需重点关注：' + needAttention.join('；'));
                }
            }
        } catch (e) {
            progressSnippet = '';
            progressDetails = [];
        }

        let html = `<div style="${CLASS_SUMMARY_STYLE.container}">`;
        html += renderHeading('📊 班级共性问题 Top5', true);
        if (errorEntries.length === 0) {
            html += `<p style="${CLASS_SUMMARY_STYLE.empty}">暂未收集到错误数据</p>`;
        } else {
            errorEntries.forEach(([cat, cnt]) => {
                html += renderLine(`• ${cat} ×${cnt}`);
            });
        }

        if (avgAIProb !== null) {
            html += renderHeading('🤖 AI生成概率均值');
            html += `<p style="margin:4px 0; color:${avgAIProb >= 50 ? '#b91c1c' : '#065f46'};">${avgAIProb}%（提醒学生批判性使用AI）</p>`;
        }

        if (topBadges.length > 0) {
            html += renderHeading('🏅 热门徽章');
            topBadges.forEach(b => html += renderLine(`• ${b}`));
        }

        if (logicPreview.length > 0) {
            html += renderHeading('🧠 逻辑追问');
            logicPreview.forEach(q => html += renderLine(`• ${q}`, true));
        }

        if (culturePreview.length > 0) {
            html += renderHeading('🌏 文化与表达');
            culturePreview.forEach(t => html += renderLine(`• ${t}`, true));
        }

        if (practicePreview.length > 0) {
            html += renderHeading('📺 推荐练习/微课');
            practicePreview.forEach(p => {
                if (typeof p === 'string') {
                    html += renderLine(`• ${p}`, true);
                } else {
                    html += renderLine(`• ${p.title || '练习'} — ${p.focus || ''}`, true);
                }
            });
        }

        if (progressSnippet) {
            html += renderHeading('📈 长期能力曲线');
            html += renderLine(progressSnippet, true);
            progressDetails.forEach(line => {
                html += renderLine(`• ${line}`, true);
            });
        }

        html += '</div>';
        return html;
    }

    function showClassSummaryPanel() {
        const html = buildClassSummaryHTML();
        showFloatingPanel('班级共性问题与建议', '#2563eb', html);
    }

    // 检测作业类型（支持9种题型）
    function detectHomeworkType(standardAnswer, studentAnswer) {
        appLogger.debug('🔍 [作业检测] 开始识别作业类型（9种题型）...');

        // 如果已通过AI分析设置了作业类型，优先使用
        if (AUTO_GRADING_STATE.autoGradingConditions.isSet && AUTO_GRADING_STATE.autoGradingConditions.homeworkType) {
            const setType = AUTO_GRADING_STATE.autoGradingConditions.homeworkType;
            // 将中文类型名映射到枚举
            const typeMap = {
                '词汇选择题': HOMEWORK_TYPES.VOCAB_CHOICE,
                '阅读理解选择题': HOMEWORK_TYPES.READING_CHOICE,
                '阅读理解简答题': HOMEWORK_TYPES.READING_SHORT,
                '句子改写': HOMEWORK_TYPES.SENTENCE_REWRITE,
                '句子合并': HOMEWORK_TYPES.SENTENCE_COMBINE,
                '段落改写': HOMEWORK_TYPES.PARAGRAPH_REWRITE,
                '短文写作': HOMEWORK_TYPES.SHORT_ESSAY,
                '专四写作练习': HOMEWORK_TYPES.TEM4_WRITING,
                '多模态作品': HOMEWORK_TYPES.MULTIMODAL,
                '选择题': HOMEWORK_TYPES.VOCAB_CHOICE,
                '填空题': HOMEWORK_TYPES.READING_SHORT,
                '作文题': HOMEWORK_TYPES.SHORT_ESSAY
            };
            for (const [label, enumVal] of Object.entries(typeMap)) {
                if (setType.includes(label)) {
                    appLogger.info(`✅ [作业检测] 使用已设置的作业类型: ${label}`);
                    return enumVal;
                }
            }
        }

        // 第一步：优先从作业要求（homework-content）中读取作业类型
        const homeworkContent = document.querySelector('.homework-content');
        const requirementText = homeworkContent ? (homeworkContent.textContent || '').toLowerCase() : '';
        
        if (requirementText) {
            appLogger.debug('📄 [作业检测] 找到作业要求，分析中...');
            
            // ============ 精确类型匹配（9种题型） ============
            
            // (8) 专四写作练习
            if (/tem[-\s]?4|专四|专业四级/.test(requirementText)) {
                appLogger.info('📝 [作业检测] 检测到：专四写作练习');
                return HOMEWORK_TYPES.TEM4_WRITING;
            }
            
            // (9) 多模态作品
            if (/multi[-\s]?modal|多模态|视频.*作品|音频.*作品|图文/.test(requirementText)) {
                appLogger.info('🎬 [作业检测] 检测到：多模态作品');
                return HOMEWORK_TYPES.MULTIMODAL;
            }
            
            // (5) 句子合并（要在句子改写之前检测）
            if (/combine|merge|合并.*句|sentence\s*combin/.test(requirementText)) {
                appLogger.info('🔗 [作业检测] 检测到：句子合并');
                return HOMEWORK_TYPES.SENTENCE_COMBINE;
            }
            
            // (4) 句子改写
            if (/rewrite.*sentence|paraphrase.*sentence|sentence\s*rewrit|改写.*句|句.*改写/.test(requirementText)) {
                appLogger.info('✏️ [作业检测] 检测到：句子改写');
                return HOMEWORK_TYPES.SENTENCE_REWRITE;
            }
            
            // (6) 段落改写
            if (/rewrite.*paragraph|paraphrase.*paragraph|paragraph\s*rewrit|改写.*段|段.*改写/.test(requirementText)) {
                appLogger.info('📝 [作业检测] 检测到：段落改写');
                return HOMEWORK_TYPES.PARAGRAPH_REWRITE;
            }
            
            // (7) 短文写作
            if (/essay|write\s+(an?\s+)?essay|composition|write\s+about|write\s+a\s+(short\s+)?passage|作文|短文写作|写作/.test(requirementText)) {
                appLogger.info('📝 [作业检测] 检测到：短文写作');
                return HOMEWORK_TYPES.SHORT_ESSAY;
            }
            
            // (3) 阅读理解简答题
            if (/(reading|阅读|passage|text)[\s\S]{0,100}(short\s*answer|简答|brief\s*answer|answer\s*the\s*question)/.test(requirementText) ||
                /answer\s*the\s*(following\s*)?question.*(?:reading|passage|text)/i.test(requirementText)) {
                appLogger.info('📖 [作业检测] 检测到：阅读理解简答题');
                return HOMEWORK_TYPES.READING_SHORT;
            }
            
            // (2) 阅读理解选择题
            if (/(reading|阅读|passage|text|comprehension)[\s\S]{0,100}(choose|select|multiple\s*choice|选择)/.test(requirementText)) {
                appLogger.info('📖 [作业检测] 检测到：阅读理解选择题');
                return HOMEWORK_TYPES.READING_CHOICE;
            }
            
            // (1) 词汇选择题
            if (/(vocabulary|vocab|词汇|单词)[\s\S]{0,50}(choose|select|test|选择|测试)/.test(requirementText) ||
                /choose|select|multiple\s*choice|pick\s*the\s*best|选择|单选|多选/.test(requirementText)) {
                appLogger.info('⭕ [作业检测] 检测到：词汇选择题');
                return HOMEWORK_TYPES.VOCAB_CHOICE;
            }
            
            // ============ 语义分析兜底 ============
            if (/analyze|分析|discuss|讨论|explain|解释|summarize|总结|概括/.test(requirementText)) {
                appLogger.info('📝 [作业检测] 语义分析检测到分析/论述类，归为短文写作');
                return HOMEWORK_TYPES.SHORT_ESSAY;
            }
        }

        // ============ 第二层：从答案特征推断 ============
        appLogger.debug('📄 [作业检测] 使用答案特征推断...');
        
        const standardText = standardAnswer ? standardAnswer.trim() : '';
        const studentText = studentAnswer ? studentAnswer.trim() : '';
        
        // 选择题特征
        const hasChoicePattern = /[1-9]\d*\s*[-~:：.、]\s*[A-D]/i.test(standardText);
        const multipleChoiceCount = (standardText.match(/[A-D]/gi) || []).length;
        
        // 短答案特征（阅读理解简答）
        const isShortAnswer = standardText.split(/\n+/).filter(l => l.trim()).every(l => l.trim().split(/\s+/).length <= 12);
        
        // 长文本特征
        const isLongText = standardText.length > 100 || studentText.length > 200;
        const hasEnglishText = /[a-z]{3,}/i.test(studentText);
        
        if (hasChoicePattern && multipleChoiceCount >= 2) {
            // 如果有阅读理解上下文，归为阅读理解选择题
            if (requirementText && /(reading|passage|text|阅读)/.test(requirementText)) {
                return HOMEWORK_TYPES.READING_CHOICE;
            }
            return HOMEWORK_TYPES.VOCAB_CHOICE;
        }
        
        if (isShortAnswer && !hasChoicePattern && standardText.length > 0 && standardText.length < 200) {
            return HOMEWORK_TYPES.READING_SHORT;
        }
        
        if (isLongText && hasEnglishText) {
            return HOMEWORK_TYPES.SHORT_ESSAY;
        }
        
        if (isLongText) {
            return HOMEWORK_TYPES.SHORT_ESSAY;
        }
        
        // 默认为词汇选择题
        appLogger.info('⭕ [作业检测] 默认为：词汇选择题');
        return HOMEWORK_TYPES.VOCAB_CHOICE;
    }

    // 选择题评分逻辑
    function calculateScoreForChoice(standardAnswer, studentAnswer, totalScore = 100, parsedAnswers = null) {
        appLogger.debug('⭕ [选择题评分] 开始计算选择题分数...');
        
        try {
            // 如果已提供解析后的答案，直接使用；否则进行解析
            let correctAnswers, studentAnswers;
            if (parsedAnswers && parsedAnswers.correct && parsedAnswers.student) {
                correctAnswers = parsedAnswers.correct;
                studentAnswers = parsedAnswers.student;
                appLogger.debug('⚡ [选择题评分] 使用预解析的答案对象，跳过重复解析');
            } else {
                correctAnswers = parseAnswers(standardAnswer);
                studentAnswers = parseAnswers(studentAnswer);
            }
            
            // ✅ 新增：尝试补充学生答案中缺失的题号（传递已解析的答案对象）
            studentAnswers = supplementMissingQuestionNumbers(studentAnswers, correctAnswers);
            
            const totalQuestions = Object.keys(correctAnswers).length;
            if (totalQuestions === 0) {
                appLogger.warn('⚠️ [选择题评分] 无法解析题目数量');
                return 0;
            }
            
            let correctCount = 0;
            for (let qNum in correctAnswers) {
                const correct = correctAnswers[qNum].toUpperCase();
                const student = studentAnswers[qNum] ? studentAnswers[qNum].toUpperCase() : '';
                if (correct === student) {
                    correctCount++;
                }
            }
            
            const score = Math.round((correctCount / totalQuestions) * totalScore);
            appLogger.info(`✅ [选择题评分] 对了 ${correctCount}/${totalQuestions} 题，得分: ${score}`);
            return score;
            
        } catch (error) {
            appLogger.error('❌ [选择题评分] 计算失败:', error);
            return totalScore;
        }
    }

    // 填空题评分逻辑（部分正确可得部分分数）
    function calculateScoreFillBlank(standardAnswer, studentAnswer, totalScore = 100, parsedAnswers = null) {
        appLogger.debug('✏️ [填空题评分] 开始计算填空题分数...');
        
        try {
            const standardLines = standardAnswer.trim().split(/\n+/).filter(l => l.trim());
            const studentLines = studentAnswer.trim().split(/\n+/).filter(l => l.trim());
            
            if (standardLines.length === 0) {
                return totalScore;
            }
            
            let correctCount = 0;
            const totalLines = standardLines.length;
            
            // 逐行比较答案（允许部分匹配）
            for (let i = 0; i < Math.min(standardLines.length, studentLines.length); i++) {
                const standard = standardLines[i].trim();
                const student = studentLines[i].trim();
                
                // 精确匹配或包含匹配
                if (standard.toLowerCase() === student.toLowerCase() || 
                    student.toLowerCase().includes(standard.toLowerCase())) {
                    correctCount++;
                }
            }
            
            const score = Math.round((correctCount / totalLines) * totalScore);
            appLogger.info(`✅ [填空题评分] 答对 ${correctCount}/${totalLines} 条，得分: ${score}`);
            return score;
            
        } catch (error) {
            appLogger.error('❌ [填空题评分] 计算失败:', error);
            return totalScore;
        }
    }

    function tokenizeEnglishWords(text) {
        if (!text || typeof text !== 'string') return [];
        return (text.match(/[A-Za-z']+/g) || []).map(token => token.trim()).filter(Boolean);
    }

    function normalizeWord(word) {
        return (word || '').toLowerCase();
    }

    function stemWord(word) {
        const lower = normalizeWord(word);
        if (lower.length <= 4) return lower;
        return lower
            .replace(/(ing|ed|es)$/i, '')
            .replace(/s$/i, '');
    }

    function levenshteinDistance(a, b) {
        const s = normalizeWord(a);
        const t = normalizeWord(b);
        if (!s) return t.length;
        if (!t) return s.length;

        const rows = s.length + 1;
        const cols = t.length + 1;
        const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

        for (let i = 0; i < rows; i++) matrix[i][0] = i;
        for (let j = 0; j < cols; j++) matrix[0][j] = j;

        for (let i = 1; i < rows; i++) {
            for (let j = 1; j < cols; j++) {
                const cost = s[i - 1] === t[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[rows - 1][cols - 1];
    }

    function calculateReadingShortScore(standardAnswer, studentAnswer, totalScore = 100, detailCollector = null) {
        appLogger.debug('📖 [简答评分] 开始按规则计算阅读简答题分数...');

        const config = GRADING_CRITERIA_CONFIG[HOMEWORK_TYPES.READING_SHORT];
        const weights = config?.weights || [40, 30, 10, 10, 5, 5];
        const deductions = config?.deductions || {};

        const standardWordsRaw = tokenizeEnglishWords(standardAnswer || '');
        const studentWordsRaw = tokenizeEnglishWords(studentAnswer || '');
        const standardWords = standardWordsRaw.map(normalizeWord);
        const studentWords = studentWordsRaw.map(normalizeWord);

        if (standardWords.length === 0) {
            appLogger.warn('⚠️ [简答评分] 标准答案词项为空，返回0分');
            return 0;
        }

        const keywordSet = new Set(standardWords.filter(word => word.length >= 3));
        const matchedKeywords = [...keywordSet].filter(word => studentWords.includes(word));
        const keywordRatio = keywordSet.size > 0 ? matchedKeywords.length / keywordSet.size : 0;

        const studentSet = new Set(studentWords);
        const union = new Set([...keywordSet, ...studentSet]);
        const intersectionCount = [...keywordSet].filter(word => studentSet.has(word)).length;
        const semanticRatio = union.size > 0 ? intersectionCount / union.size : 0;

        let keywordScore = Math.round(keywordRatio * weights[0]);
        let semanticScore = Math.round(semanticRatio * weights[1]);
        let spellingScore = weights[2];
        let wordFormScore = weights[3];
        let caseScore = weights[4];
        let formatScore = weights[5];

        if (Array.isArray(detailCollector)) {
            detailCollector.push({ label: '关键词包含', value: keywordScore, note: `${matchedKeywords.length}/${keywordSet.size}` });
            detailCollector.push({ label: '句意相符', value: semanticScore, note: `重合率${Math.round(semanticRatio * 100)}%` });
        }

        // 拼写错误：与标准词编辑距离1且非同词，按规则每处-1（上限10分模块）
        let spellingErrors = 0;
        studentWords.forEach(word => {
            if (standardWords.includes(word)) return;
            const hasNear = standardWords.some(std => Math.abs(std.length - word.length) <= 1 && levenshteinDistance(std, word) === 1);
            if (hasNear) spellingErrors += 1;
        });
        if (deductions.spelling) {
            spellingScore = Math.max(0, spellingScore + deductions.spelling * spellingErrors);
        }
        if (Array.isArray(detailCollector)) {
            detailCollector.push({ label: '拼写正确', value: spellingScore, note: `拼写错误${spellingErrors}处` });
        }

        // 词形错误：词干匹配但词形不同，按规则每处-1
        let wordFormErrors = 0;
        studentWords.forEach(word => {
            if (standardWords.includes(word)) return;
            const stem = stemWord(word);
            const hasSameStem = standardWords.some(std => stemWord(std) === stem && normalizeWord(std) !== word);
            if (hasSameStem) wordFormErrors += 1;
        });
        if (deductions.wordForm) {
            wordFormScore = Math.max(0, wordFormScore + deductions.wordForm * wordFormErrors);
        }
        if (Array.isArray(detailCollector)) {
            detailCollector.push({ label: '词性/词形正确', value: wordFormScore, note: `词形问题${wordFormErrors}处` });
        }

        // 大小写错误：同词不同大小写按规则每处-1
        let caseErrors = 0;
        const minLen = Math.min(standardWordsRaw.length, studentWordsRaw.length);
        for (let i = 0; i < minLen; i++) {
            if (
                standardWordsRaw[i] &&
                studentWordsRaw[i] &&
                standardWordsRaw[i].toLowerCase() === studentWordsRaw[i].toLowerCase() &&
                standardWordsRaw[i] !== studentWordsRaw[i]
            ) {
                caseErrors += 1;
            }
        }
        if (deductions.capitalization) {
            caseScore = Math.max(0, caseScore + deductions.capitalization * caseErrors);
        }
        if (Array.isArray(detailCollector)) {
            detailCollector.push({ label: '大小写正确', value: caseScore, note: `大小写问题${caseErrors}处` });
        }

        // 格式错误：首字母、句末标点按规则分别扣0.5
        const trimmed = (studentAnswer || '').trim();
        if (trimmed) {
            const firstLetter = trimmed.match(/[A-Za-z]/);
            if (firstLetter && firstLetter[0] !== firstLetter[0].toUpperCase() && deductions.firstCapital) {
                formatScore = Math.max(0, formatScore + deductions.firstCapital);
            }
            const hasEndingPunctuation = /[.!?。！？]$/.test(trimmed);
            if (!hasEndingPunctuation && deductions.noPeriod) {
                formatScore = Math.max(0, formatScore + deductions.noPeriod);
            }
        }
        if (Array.isArray(detailCollector)) {
            detailCollector.push({ label: '格式规范', value: formatScore, note: '含首字母大写与句末标点' });
        }

        // 字数限制：每超1词扣1分
        let overflowPenalty = 0;
        if (config?.maxWords && studentWords.length > config.maxWords) {
            overflowPenalty = studentWords.length - config.maxWords;
        }
        if (Array.isArray(detailCollector)) {
            detailCollector.push({ label: '字数限制', delta: -overflowPenalty, note: `${studentWords.length}词（上限${config?.maxWords || 10}词）` });
        }

        let total = keywordScore + semanticScore + spellingScore + wordFormScore + caseScore + formatScore - overflowPenalty;
        total = Math.max(0, Math.min(totalScore, total));

        appLogger.info(`✅ [简答评分] keyword=${keywordScore}, semantic=${semanticScore}, spelling=${spellingScore}, wordForm=${wordFormScore}, case=${caseScore}, format=${formatScore}, overflow=-${overflowPenalty}, total=${Math.round(total)}`);
        return Math.round(total);
    }

    // 作文题评分逻辑（基于长度和关键词）
    function calculateScoreForEssay(studentAnswer, totalScore = 100) {
        appLogger.debug('📝 [作文评分] 开始评估作文质量...');
        
        try {
            const answerLength = (studentAnswer || '').trim().length;
            
            // 基于字数的粗算分数
            let score = totalScore;
            
            if (answerLength < 50) {
                score = 40; // 字数太少
            } else if (answerLength < 100) {
                score = 60; // 字数不足
            } else if (answerLength < 200) {
                score = 75; // 基本完整
            } else if (answerLength < 300) {
                score = 85; // 较为完整
            } else {
                score = 95; // 详细充分
            }
            
            appLogger.info(`✅ [作文评分] 字数: ${answerLength}，评估分数: ${score}`);
            return score;
            
        } catch (error) {
            appLogger.error('❌ [作文评分] 评分失败:', error);
            return totalScore;
        }
    }

    
    // 规范化答案文本（如 "5 BCCAB" -> "1-5 BCCAB"）
    function normalizeAnswerText(answerText) {
        if (!answerText) return '';

        appLogger.debug(`📝 [答案规范化] 原始文本: ${answerText.substring(0, 100)}...`);

        let cleanedText = answerText
            .replace(/[，,]/g, '')
            .replace(/[、]/g, '')
            .replace(/题/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // ============ 第一步：移除单元标记 (Unite5:, Unite10:, etc.) ============
        cleanedText = cleanedText.replace(/\b(Unite|Unit|Chapter|第|Unit|单元|章节)\s*\d+\s*[:：]?\s*/gi, '');
        
        // ============ 第二步：处理序号前缀 "N: 1-5ABCAB" -> "1-5 ABCAB" ============
        // 移除行首的数字序号（如 "N:" 或 "1:"后跟范围）
        cleanedText = cleanedText.replace(/\d+\s*[:：]\s*(?=\d+-\d+)/g, '');
        
        appLogger.debug(`✅ [答案规范化] 清理后: ${cleanedText.substring(0, 100)}...`);

        // ============ 第三步：再次检查并移除任何残留的前缀 ============
        cleanedText = cleanedText.replace(/^[A-Za-z\s]*(?=\d+-\d+)/g, '').trim();
        
        // 纯答案序列（无题号）：如 "BCDAB ABCDA" 或 "BCCABABADA"
        if (!/\d/.test(cleanedText)) {
            const seqParts = cleanedText.split(/\s+/).filter(Boolean);
            const sequences = [];
            for (let part of seqParts) {
                const seq = part.replace(/[^A-Da-d]/g, '');
                if (seq.length >= 2) {
                    sequences.push(seq);
                }
            }
            if (sequences.length > 0) {
                let start = 1;
                const lines = sequences.map((seq) => {
                    const end = start + seq.length - 1;
                    const line = `${start}-${end} ${seq}`;
                    start = end + 1;
                    return line;
                });
                return lines.join('\n');
            }
        }

        const lines = cleanedText.split(/\r?\n/).map((line) => {
            let trimmed = line.trim();
            if (!trimmed) return trimmed;

            // ============ 再次移除行首的任何文本前缀 ============
            trimmed = trimmed.replace(/^[A-Za-z\s]*(?=\d|-|[a-d])/gi, '');

            // 规范化范围写法（如 1-5题：B C D）
            trimmed = trimmed.replace(/(\d+)\s*[-~]\s*(\d+)[：:]?\s*([A-Da-d\s]+)/g, (match, start, end, seq) => {
                const cleanedSeq = seq.replace(/\s+/g, '').replace(/[^A-Da-d]/g, '');
                return cleanedSeq ? `${start}-${end} ${cleanedSeq}` : match;
            });

            // 规范化单段写法（如 5 BCCAB -> 1-5 BCCAB）
            // 但要注意：只有当前面没有其他范围信息时才应用
            if (!trimmed.includes('-')) {
                trimmed = trimmed.replace(/(^|\s)(\d+)\s*[：:]?\s*([A-Da-d]{2,})(?=\s|$)/g, (match, lead, endNum, seq) => {
                    const end = parseInt(endNum, 10);
                    if (end === seq.length) {
                        return `${lead}1-${end} ${seq}`;
                    }
                    return match;
                });
            }

            // 去掉多余的序号前缀（如果有的话）
            trimmed = trimmed.replace(/^\d+\s*[:：]\s*/, '');
            
            return trimmed.replace(/\s+/g, ' ');
        });

        const result = lines.join('\n').trim();
        appLogger.debug(`✅ [答案规范化] 最终结果: ${result.substring(0, 100)}...`);
        return result;
    }

    function isValidAnswerText(answerText) {
        // ============ 避免重复规范化，直接在这里做最小化的检查 ============
        if (!answerText || !/[A-Da-d]/.test(answerText)) {
            return false;
        }
        // 只要包含至少一个有效的范围或答案格式就认为有效
        // 范围格式: 1-5 ABCAB 或 单题格式: 1.A 2.B
        return /\d+\s*[-~:\u3003.]\s*[A-Da-d]|(\d+)\s*[-~]\s*(\d+)[\s\.\-:\u3003]*[A-Da-d]+/.test(answerText);
    }

    // 提取标准答案
    function extractStandardAnswer() {
        if (AUTO_GRADING_STATE.standardAnswer) {
            return AUTO_GRADING_STATE.standardAnswer;
        }

        const answerRegex = /(\d+(?:\s*[-~]\s*\d+)?[\s\-:：.、]+[A-Da-d][A-Da-d0-9\s\-:：.、]*)/;

        // 优先从作业详情页的"参考答案"区域提取（只取该区域的答案块）
        const labelCandidates = document.querySelectorAll('p, span, div');
        let foundReferenceLabel = false;
        for (let label of labelCandidates) {
            const text = label.textContent ? label.textContent.trim() : '';
            if (text === '参考答案' || text.includes('参考答案')) {
                foundReferenceLabel = true;
                const labelContainer = label.closest('div');
                const answerContainer = labelContainer ? labelContainer.nextElementSibling : null;

                if (answerContainer) {
                    let answerBlock = null;
                    const candidateBlocks = answerContainer.querySelectorAll('div.font-400.text-12px.lh-20px');
                    for (let block of candidateBlocks) {
                        if (block.classList.contains('color-#5a5a5a')) {
                            answerBlock = block;
                            break;
                        }
                    }
                    if (!answerBlock) {
                        answerBlock = answerContainer;
                    }
                    const answerText = answerBlock ? (answerBlock.textContent || '').trim() : '';
                    if (isValidAnswerText(answerText)) {
                        const normalized = normalizeAnswerText(answerText);
                        AUTO_GRADING_STATE.standardAnswer = normalized;
                        appLogger.info(`✅ [自动批改] 从参考答案区域提取到标准答案: ${normalized}`);
                        return normalized;
                    }
                }

            }
        }

        // 查找标准答案区域
        const allText = document.body.textContent;
        
        // 查找包含答案的区域
        const answerPatterns = [
            /标准答案[：:]\s*([^\n]+)/i,
            /正确答案[：:]\s*([^\n]+)/i,
            /参考答案[：:]\s*([^\n]+)/i,
            /答案[：:]\s*([A-Da-d0-9\s\-:：.、]+)/i
        ];
        
        if (!foundReferenceLabel) {
            for (let pattern of answerPatterns) {
            const match = allText.match(pattern);
            if (match && match[1]) {
                const answer = normalizeAnswerText(match[1].trim());
                if (isValidAnswerText(answer)) {
                    appLogger.info(`✅ [自动批改] 提取到标准答案: ${answer}`);
                    AUTO_GRADING_STATE.standardAnswer = answer;
                    return answer;
                }
            }
            }
        }
        
        // 尝试从AI评分理由中提取
        const divs = document.querySelectorAll('div');
        for (let div of divs) {
            const text = div.textContent;
            if (text.includes('AI') || text.includes('评分')) {
                // 查找答案格式文本
                const answerMatch = text.match(/([1-9][\s\-:：]+[A-Da-d][\s\-:：A-Da-d0-9]+)/);
                if (answerMatch) {
                    const answer = normalizeAnswerText(answerMatch[0]);
                    if (isValidAnswerText(answer)) {
                        appLogger.info(`✅ [自动批改] 从AI评分中提取到答案: ${answer}`);
                        AUTO_GRADING_STATE.standardAnswer = answer;
                        return AUTO_GRADING_STATE.standardAnswer;
                    }
                }
            }
        }
        
        console.warn('⚠️ [自动批改] 未找到标准答案');
        return '';
    }
    
    // 提取学生答案
    function extractStudentAnswer() {
        appLogger.debug('📝 [自动批改] 开始提取学生答案...');
        
        // ============ 第一步：优先从批改详情页面提取 ============
        
        // 在新的批改界面中，学生答案在 .break-all.break-words 或 .break-words 里
        // 也包括 .answer-box (文档型答案)
        const primaryAreas = [
            document.querySelector('.answer-box'),                           // 文档答案框
            document.querySelector('.markdown-latex-container'),             // Markdown 答案框
            document.querySelector('.evaluation-content'),                   // 评阅内容框
            document.querySelector('.custom-review-container'),              // 自定义批改容器
            document.querySelector('.correct-left .break-all.break-words'),  // 原有选择
            document.querySelector('.correct-left .break-words'),
            document.querySelector('.break-all.break-words'),
            document.querySelector('[class*="homework-content"]'),
            document.querySelector('[class*="studentWork"]'),
            document.querySelector('[class*="student-answer"]')
        ];
        
        let longestTextContent = ''; // 保存最长的文本内容（兜底用）
        
        for (let primaryArea of primaryAreas) {
            if (!primaryArea) continue;
            
            const text = (primaryArea.textContent || primaryArea.innerText || '').trim();
            const displayText = text.substring(0, 100).replace(/\n/g, ' ');
            appLogger.debug(`📖 [自动批改] 检查区域文本: ${displayText}`);
            
            // 保存最长的文本内容
            if (text.length > longestTextContent.length && text.length > 10) {
                longestTextContent = text;
            }
            
            // ============ 固化的检测顺序，优先级递降 ============
            
            // 检查1：数字+范围+字母（如 1-5CABBC 6-10DDCBA）
            if (/\d+\s*[-~]\s*\d+\s*[A-Da-d]{3,}/.test(text)) {
                appLogger.debug(`✅ [自动批改] 从作业内容提取范围型答案`);
                return text.trim();
            }
            
            // 检查2：有题号分隔的答案（如 1. A 2. B 或 1-5:CABBC 或 1 A 2 B）
            if (/\d+[\s\.\-~:：.、]+[A-Da-d](\s+\d+[\s\.\-~:：.、]+[A-Da-d])?/.test(text)) {
                appLogger.debug(`✅ [自动批改] 从作业内容提取分隔型答案`);
                return text.trim();
            }
            
            // 检查3：纯字母序列，但不是太短（如 AABDCDDCBC）
            if (/[A-Da-d]{5,}/.test(text) && 
                text.replace(/[A-Da-d]/g, '').replace(/\s+/g, '').length < 10) {  // 干扰字符不超过10个
                appLogger.debug(`✅ [自动批改] 从作业内容直接提取纯字母答案`);
                return text.trim();
            }
        }
        
        // ============ 第二步：从所有文本区域扫描提取 ============
        appLogger.debug('📋 [自动批改] 尝试全页面扫描...');
        
        // 支持更多格式的正则
        const answerPatterns = [
            /(\d+[\s\.\-~]+\d+[\s\.\-:：]*[A-Da-d]{3,}(?:\s+\d+[\s\.\-~]+\d+[\s\.\-:：]*[A-Da-d]{3,})*)/,  // 范围型
            /(\d+(?:\s*[-~:．.]\s*\d+)?[\s\-~:：.、]+[A-Da-d][A-Da-d0-9\s\-~:：.、]*)/,  // 分隔型
            /([A-Da-d]{10,})/                                    // 纯字母序列
        ];
        
        // 查找所有可能包含答案的区域
        const textElements = document.querySelectorAll('p, div, span');
        let longestAnswerChunk = '';
        
        for (let el of textElements) {
            const text = (el.textContent || '').trim();
            
            // 跳过过短的文本
            if (text.length < 5 || text.length > 500) continue;
            
            // 尝试多个正则
            for (let pattern of answerPatterns) {
                const answerMatch = text.match(pattern);
                if (answerMatch) {
                    const candidate = answerMatch[1] || answerMatch[0];
                    
                    // 保留最长的有效答案块
                    if (candidate.length > longestAnswerChunk.length && 
                        /[A-Da-d]{3,}/.test(candidate)) {
                        longestAnswerChunk = candidate;
                    }
                }
            }
        }
        
        if (longestAnswerChunk) {
            appLogger.debug(`✅ [自动批改] 全页扫描提取到学生答案: ${longestAnswerChunk}`);
            return longestAnswerChunk.trim();
        }
        
        // ============ 第二步B：直接检查 .answer-box 或文档容器中的内容 ============
        appLogger.debug('🔍 [自动批改] 直接检查答案容器...');
        
        // 检查 .answer-box 容器
        const answerBox = document.querySelector('.answer-box');
        if (answerBox) {
            const answerBoxText = (answerBox.textContent || answerBox.innerText || '').trim();
            if (answerBoxText && answerBoxText.length > 10) {
                appLogger.debug(`✅ [自动批改] 从 .answer-box 提取答案, 长度: ${answerBoxText.length}`);
                appLogger.debug(`📄 [自动批改] 内容预览: ${answerBoxText.substring(0, 100)}...`);
                // 如果不符合选择题格式，作为文档型答案返回
                if (!/^[A-Da-d0-9\s\.\-~:：.、]*$/.test(answerBoxText)) {
                    return answerBoxText;
                }
            }
        }
        
        // 检查 .markdown-latex-container 容器
        const markdownContainer = document.querySelector('.markdown-latex-container');
        if (markdownContainer) {
            const markdownText = (markdownContainer.textContent || markdownContainer.innerText || '').trim();
            if (markdownText && markdownText.length > 10) {
                appLogger.debug(`✅ [自动批改] 从 .markdown-latex-container 提取答案, 长度: ${markdownText.length}`);
                appLogger.debug(`📄 [自动批改] 内容预览: ${markdownText.substring(0, 100)}...`);
                return markdownText;
            }
        }
        
        // 检查 .evaluation-content 容器
        const evaluationContent = document.querySelector('.evaluation-content');
        if (evaluationContent) {
            const evalText = (evaluationContent.textContent || evaluationContent.innerText || '').trim();
            if (evalText && evalText.length > 10) {
                appLogger.debug(`✅ [自动批改] 从 .evaluation-content 提取答案, 长度: ${evalText.length}`);
                appLogger.debug(`📄 [自动批改] 内容预览: ${evalText.substring(0, 100)}...`);
                return evalText;
            }
        }
        
        // ============ 第三步：从特定的作业容器提取 ============
        appLogger.debug('🔍 [自动批改] 查找特定作业容器...');
        
        // 查找 correct-container 或类似的批改容器
        const correctContainers = document.querySelectorAll('[class*="correct"]');
        for (let container of correctContainers) {
            // 找到容器内左侧（通常是学生答案）的内容
            const leftPanel = container.querySelector('[class*="left"], [class*="correct-left"]');
            if (leftPanel) {
                const allText = (leftPanel.textContent || '').trim();
                
                // 提取答案行（尝试多种格式）
                const lines = allText.split('\n');
                for (let line of lines) {
                    line = line.trim();
                    if (line.length < 5) continue;
                    
                    // 纯字母
                    if (/^[A-Da-d]{5,}$/.test(line)) {
                        appLogger.debug(`✅ [自动批改] 从容器内提取纯字母答案: ${line}`);
                        return line;
                    }
                    
                    // 范围型
                    if (/\d+[\s\.\-]*\d*\s*[A-Da-d]{3,}/.test(line)) {
                        appLogger.debug(`✅ [自动批改] 从容器内提取范围答案: ${line}`);
                        return line;
                    }
                    
                    // 分隔型
                    if (/\d+[\s\.\-~:：.、][A-Da-d]/.test(line)) {
                        appLogger.debug(`✅ [自动批改] 从容器内提取分隔答案: ${line}`);
                        return line;
                    }
                }
            }
        }
        
        // ============ 兜底：如果没找到选择题答案，返回最长文本（可能是论述题） ============
        if (longestTextContent && longestTextContent.length > 10) {
            appLogger.info(`💡 [自动批改] 未找到选择题答案格式，返回文本内容（长度: ${longestTextContent.length}）`);
            appLogger.debug(`📄 [自动批改] 内容预览: ${longestTextContent.substring(0, 100)}...`);
            return longestTextContent;
        }
        
        // ============ 第四步：优先检测文档预览窗口 ============
        appLogger.debug('🔍 [自动批改] 未找到文本答案，检查是否有文档预览或附件...');
        
        // 检测文档预览窗口（智慧树的文档预览界面）
        const docPreview = document.querySelector('iframe[src*="aliyuncs.com"], iframe[src*="preview"], iframe[src*="imm"]');
        const hasDocPreview = docPreview || document.querySelector('.w-page canvas') || document.querySelectorAll('canvas').length > 2;
        
        if (hasDocPreview) {
            appLogger.info('📄 [自动批改] 检测到文档预览窗口，准备截屏识别');
            return '[[CANVAS_DOCUMENT_DETECTED]]';
        }
        
        const attachmentResult = detectAttachment();
        if (attachmentResult) {
            return attachmentResult;
        }
        
        appLogger.warn('⚠️ [自动批改] 未找到学生答案');
        return '';
    }
    
    // 检测学生作业中的附件
    function detectAttachment() {
        try {
            appLogger.debug('📎 [附件检测] 开始检测附件类型...');
            
            // 优先级1: 检测 Canvas 元素（WPS 文档查看器使用 canvas）
            // Canvas通常用于Office文档预览，应该优先检测
            const canvases = document.querySelectorAll('canvas');
            const validCanvases = Array.from(canvases).filter(canvas => {
                const width = canvas.width || 0;
                const height = canvas.height || 0;
                
                // 有效的内容Canvas应该有足够的尺寸
                if (width < 200 || height < 200) return false;
                
                // 检查canvas是否可见
                const style = window.getComputedStyle(canvas);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                
                return true;
            });
            
            if (validCanvases.length > 0) {
                appLogger.info(`🎨 [附件检测] 优先级1：发现 ${validCanvases.length} 个 Canvas 文档元素（可能是Word/Excel/WPS预览）`);
                appLogger.debug(`🎨 [附件检测] Canvas 规格:`, validCanvases.map(canvas => ({
                    width: canvas.width,
                    height: canvas.height,
                    className: canvas.className
                })));
                return '[[CANVAS_DOCUMENT_DETECTED]]'; // 返回标记，后续处理
            }
            
            // 优先级2: 检测 iframe（嵌入的文档查看器）
            // 阿里云预览器、office在线等都使用iframe
            const iframes = document.querySelectorAll('iframe');
            const validIframes = Array.from(iframes).filter(iframe => {
                const src = iframe.src || '';
                
                // 检查是否是文档查看器（包括阿里云预览器）
                if (src.includes('doc') || src.includes('pdf') || src.includes('wps') || 
                    src.includes('viewer') || src.includes('preview') || 
                    src.includes('aliyuncs.com') || src.includes('imm.')) {
                    return true;
                }
                
                return false;
            });
            
            if (validIframes.length > 0) {
                appLogger.info(`📄 [附件检测] 优先级2：发现 ${validIframes.length} 个文档 iframe（可能是在线预览）`);
                appLogger.debug(`📄 [附件检测] Iframe 信息:`, validIframes.map(iframe => ({
                    src: iframe.src.substring(0, 100)
                })));
                return '[[IFRAME_DOCUMENT_DETECTED]]'; // 返回标记，后续处理
            }
            
            // 优先级3: 检测图片附件（通常是扫描件或截图）
            const images = document.querySelectorAll('img');
            const validImages = Array.from(images).filter(img => {
                // 排除空图片、图标、小图标
                const src = img.src || '';
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;
                
                // 过滤掉太小的图片（通常是图标）
                if (width < 100 || height < 100) return false;
                
                // 排除常见的图标路径
                if (src.includes('icon') || src.includes('logo') || src.includes('avatar')) {
                    return false;
                }
                
                // 检查图片是否可见
                const style = window.getComputedStyle(img);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return false;
                }
                
                return true;
            });
            
            if (validImages.length > 0) {
                appLogger.info(`📸 [附件检测] 优先级3：发现 ${validImages.length} 张图片附件（可能是扫描件或截图）`);
                appLogger.debug(`📸 [附件检测] 图片信息:`, validImages.map(img => ({
                    src: img.src.substring(0, 100),
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height
                })));
                return '[[IMAGE_ATTACHMENT_DETECTED]]'; // 返回标记，后续处理
            }
            
            // 检测下载链接附件
            const downloadLinks = document.querySelectorAll('a[href*="download"], a[href*="/file/"], a[title*="下载"]');
            if (downloadLinks.length > 0) {
                appLogger.info(`🔗 [附件检测] 发现 ${downloadLinks.length} 个下载链接附件`);
                return '[[DOWNLOAD_LINK_DETECTED]]'; // 返回标记，后续处理
            }
            
            // 检测仅显示文件大小的附件（无明确链接）
            const fileSizeIndicators = document.querySelectorAll('[class*="fileSize"], [class*="filesize"], [class*="annotateFileSize"]');
            if (fileSizeIndicators.length > 0) {
                appLogger.info(`📎 [附件检测] 发现 ${fileSizeIndicators.length} 个文件大小标记，可能为附件列表`);
                return '[[FILE_ATTACHMENT_DETECTED]]';
            }
            
            appLogger.debug('✅ [附件检测] 未检测到附件');
            return null;
        } catch (error) {
            appLogger.error('❌ [附件检测] 检测失败:', error);
            return null;
        }
    }
    
    // 处理图片附件 - 使用 OCR 识别（含图片放大优化）
    async function processImageAttachment() {
        let isFullScreenEntered = false;
        try {
            appLogger.info('📸 [图片处理] 开始处理图片附件...');
            
            // 尝试进入全屏，以获得更好的OCR识别效果
            appLogger.debug('📺 [图片处理] 尝试进入全屏模式...');
            try {
                if (typeof window.enterFullScreen === 'function') {
                    isFullScreenEntered = window.enterFullScreen();
                    appLogger.debug(`📺 [图片处理] 全屏进入结果: ${isFullScreenEntered}`);
                    
                    if (isFullScreenEntered) {
                        // 等待全屏动画和页面重排完成
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        appLogger.debug('✅ [图片处理] 已进入全屏，等待完成');
                    } else {
                        appLogger.warn('⚠️ [图片处理] 全屏进入失败，将继续处理（可能影响OCR质量）');
                    }
                } else {
                    appLogger.warn('⚠️ [图片处理] window.enterFullScreen 函数不可用');
                }
            } catch (error) {
                appLogger.warn('⚠️ [图片处理] 全屏切换异常:', error.message);
            }
            
            // 找到学生作业区域的图片
            const images = document.querySelectorAll('img');
            const validImages = Array.from(images).filter(img => {
                const src = img.src || '';
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;
                
                if (width < 100 || height < 100) return false;
                if (src.includes('icon') || src.includes('logo') || src.includes('avatar')) return false;
                
                const style = window.getComputedStyle(img);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                
                return true;
            });
            
            if (validImages.length === 0) {
                console.error('❌ [图片处理] 未找到有效的图片');
                return '图片处理失败：未找到图片';
            }
            
            // 获取第一张图片的 base64 数据
            const img = validImages[0];
            appLogger.debug('📸 [图片处理] 准备处理图片:', img.src.substring(0, 100));
            
            // 将图片转换为 base64
            const imageData = await convertImageToBase64(img);
            
            if (!imageData) {
                console.error('❌ [图片处理] 图片转换失败');
                return '图片处理失败：无法读取图片';
            }
            
            appLogger.info('📸 [图片处理] 图片转换成功，准备调用 OCR...');
            showNotification('🔍 正在识别图片中的文字...', '#2196F3', 2000);
            
            // 调用 background.js 的 OCR 功能 - 添加重试机制
            let response = null;
            let retryCount = 0;
            const maxRetries = 2;
            
            while (retryCount <= maxRetries) {
                try {
                    appLogger.debug(`📸 [图片处理] OCR 尝试 ${retryCount + 1}/${maxRetries + 1}...`);
                    response = await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('OCR 请求超时'));
                        }, 15000); // 15秒超时
                        
                        chrome.runtime.sendMessage(
                            { action: 'performOCR', imageData: imageData },
                            (response) => {
                                clearTimeout(timeout);
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    resolve(response);
                                }
                            }
                        );
                    });
                    
                    // 如果OCR成功，检查是否有识别结果
                    if (response && response.success && response.text && response.text.trim().length > 0) {
                        appLogger.info('✅ [图片处理] OCR 识别成功');
                        appLogger.debug('📄 [图片处理] 识别内容长度:', response.text.length);
                        appLogger.debug('📄 [图片处理] 识别内容预览:', response.text.substring(0, 200));
                        showNotification('✅ 图片识别成功！', '#4CAF50', 1500);
                        return response.text;
                    } else if (response && response.success && (!response.text || response.text.trim().length === 0)) {
                        // OCR成功但结果为空，可能是图片不清晰
                        appLogger.warn(`⚠️ [图片处理] OCR识别结果为空（第${retryCount + 1}次）`);
                        if (retryCount < maxRetries) {
                            appLogger.debug('📸 [图片处理] 准备重试...');
                            retryCount++;
                            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待后重试
                            continue;
                        }
                    } else {
                        // OCR失败
                        appLogger.error(`❌ [图片处理] OCR 识别失败（第${retryCount + 1}次）:`, response?.error || '未知错误');
                        if (retryCount < maxRetries) {
                            appLogger.debug('📸 [图片处理] 准备重试...');
                            retryCount++;
                            await new Promise(resolve => setTimeout(resolve, 1500)); // 增加重试等待
                            continue;
                        }
                    }
                    break; // 退出重试循环
                } catch (error) {
                    appLogger.error(`❌ [图片处理] OCR 异常（第${retryCount + 1}次）:`, error.message);
                    if (retryCount < maxRetries) {
                        appLogger.debug('📸 [图片处理] 准备重试...');
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        continue;
                    }
                    throw error;
                }
            }
            
            // 所有重试都失败 - 提供更有帮助的建议
            appLogger.error('❌ [图片处理] OCR 识别失败（已重试' + maxRetries + '次）:', response?.error || '未知错误');
            
            // 分析失败原因，给出针对性建议
            let userMessage = '❌ 图片文字识别失败。可能原因和解决方案：';
            let helpInfo = '\n\n📌 请手动处理此作业，或：\n' +
                          '1. 确保图片/文档清晰度高\n' +
                          '2. 对于Office文档，建议优先查看原始文件\n' +
                          '3. 确认文字与背景对比度充分';
            
            if (response?.error && response.error.includes('清晰')) {
                userMessage += '\n• 图片太模糊或不清晰';
            }
            if (response?.error && response.error.includes('大小')) {
                userMessage += '\n• 文字太小，难以识别';
            }
            if (response?.error && response.error.includes('对比度')) {
                userMessage += '\n• 文字与背景对比度不足';
            }
            if (!response?.error || response.error.includes('无法识别')) {
                userMessage += '\n• 可能是Word/PDF等Office文档的图像化版本，OCR效果受限';
            }
            
            userMessage += helpInfo;
            appLogger.warn('💡 [图片处理] ' + userMessage.replace(/\n/g, ' '));
            showNotification(userMessage, '#FF9800', 4000);
            
            return '图片识别失败（建议手动批改）'
            
        } catch (error) {
            appLogger.error('❌ [图片处理] 处理失败:', error);
            showNotification('❌ 附件处理异常，请手动查看作业', '#FF5252', 2000);
            return '图片处理异常：' + error.message;
        } finally {
            // 退出全屏模式
            if (isFullScreenEntered) {
                try {
                    appLogger.debug('📺 [图片处理] 尝试退出全屏...');
                    if (typeof window.exitFullScreen === 'function') {
                        window.exitFullScreen();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        appLogger.debug('✅ [图片处理] 已退出全屏');
                    }
                } catch (error) {
                    appLogger.warn('⚠️ [图片处理] 退出全屏失败:', error.message);
                }
            }
        }
    }
    
    // 处理 Canvas 文档（WPS 文档查看器）- 多页文档支持
    async function processCanvasDocument() {
        try {
            appLogger.info('🎨 [Canvas处理] 开始处理 Canvas 文档...');
            
            // 等待Canvas完全加载和渲染
            appLogger.debug('⏳ [Canvas处理] 等待Canvas文档完全加载（5秒）...');
            showNotification('⏳ 正在加载文档预览...', '#2196F3', 1000);
            await new Promise(resolve => setTimeout(resolve, 5000)); // 增加到5秒
            
            // 检查页面是否已经有文档内容渲染
            const canvases = document.querySelectorAll('canvas');
            appLogger.debug(`🎨 [Canvas处理] 检测到 ${canvases.length} 个 Canvas 元素`);
            
            // 检测是否是多页文档
            const pageLabels = document.querySelectorAll('.page-lab, .menu-btn, [class*="page"], [class*="页"]');
            let totalPages = 1;
            
            for (let label of pageLabels) {
                const text = label.textContent || ''
                const pageMatch = text.match(/第\s*(\d+)\s*页[\s\/*共]*(\d+)/);
                if (pageMatch && pageMatch[2]) {
                    totalPages = parseInt(pageMatch[2]);
                    appLogger.info(`🎨 [Canvas处理] 检测到多页文档，共 ${totalPages} 页`);
                    break;
                }
            }
            
            // 如果是多页文档（3页以上），使用多页处理
            if (totalPages > 2) {
                appLogger.info(`🎨 [Canvas处理] 切换到多页文档处理模式...`);
                showNotification(`📖 检测到多页文档（${totalPages}页），使用逐页识别模式...`, '#2196F3', 3000);
                await new Promise(resolve => setTimeout(resolve, 1500));
                return await processMultiPageDocument();
            }
            
            // 单页文档处理 - 截屏识别
            appLogger.info('📸 [Canvas处理] 开始截屏识别文档内容...');
            showNotification('📸 正在截屏识别文档...', '#2196F3', 2000);
            
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    { action: 'captureScreen' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    }
                );
            });
            
            if (!response || !response.success || !response.data) {
                appLogger.error('❌ [Canvas处理] 截屏失败');
                return '文档处理失败：截屏失败';
            }
            
            appLogger.debug('📸 [Canvas处理] 截屏成功，准备 OCR 识别...');
            
            // 调用 OCR 识别
            const ocrResponse = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    { action: 'performOCR', imageData: response.data },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    }
                );
            });
            
            if (ocrResponse && ocrResponse.success && ocrResponse.text) {
                appLogger.info('✅ [Canvas处理] 文档识别成功');
                appLogger.debug('📄 [Canvas处理] 识别内容预览:', ocrResponse.text.substring(0, 200));
                showNotification('✅ 文档识别成功！', '#4CAF50', 1500);
                return ocrResponse.text;
            } else {
                appLogger.error('❌ [Canvas处理] OCR 识别失败');
                showNotification('❌ 文档识别失败', '#FF5252', 2000);
                return '文档识别失败';
            }
            
        } catch (error) {
            appLogger.error('❌ [Canvas处理] 处理失败:', error);
            showNotification('❌ 文档处理失败', '#FF5252', 2000);
            return '文档处理失败：' + error.message;
        }
    }
    
    // 处理多页文档 - 逐页截屏OCR并合并
    async function processMultiPageDocument() {
        try {
            appLogger.info('📖 [多页处理] 开始逐页处理文档...');
            
            // 检测总页数
            const pageLabels = document.querySelectorAll('.page-lab, .menu-btn, [class*="page"], [class*="页"]');
            let totalPages = 10;
            
            for (let label of pageLabels) {
                const text = label.textContent || '';
                const pageMatch = text.match(/共\s*(\d+)\s*页/);
                if (pageMatch) {
                    totalPages = parseInt(pageMatch[1]);
                    appLogger.info(`📖 [多页处理] 检测到共 ${totalPages} 页`);
                    break;
                }
            }
            
            // 最多处理10页，避免超时
            totalPages = Math.min(totalPages, 10);
            appLogger.info(`📖 [多页处理] 将处理 ${totalPages} 页（最多10页）`);
            
            const allText = [];
            
            // 逐页处理
            for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
                appLogger.debug(`\n📖 [多页处理] 处理第 ${pageIndex}/${totalPages} 页...`);
                showNotification(`📖 处理第 ${pageIndex}/${totalPages} 页...`, '#2196F3', 2000);
                
                // 等待当前页渲染完成
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // 截屏当前页
                appLogger.debug(`📸 [多页处理] 截屏第 ${pageIndex} 页...`);
                const response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(
                        { action: 'captureScreen' },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve(response);
                            }
                        }
                    );
                });
                
                if (!response || !response.success || !response.data) {
                    appLogger.error(`❌ [多页处理] 第 ${pageIndex} 页截屏失败`);
                    continue;
                }
                
                // OCR识别当前页
                appLogger.debug(`🔍 [多页处理] OCR识别第 ${pageIndex} 页...`);
                const ocrResponse = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(
                        { action: 'performOCR', imageData: response.data },
                        (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve(response);
                            }
                        }
                    );
                });
                
                if (ocrResponse && ocrResponse.success && ocrResponse.text) {
                    const pageText = ocrResponse.text.trim();
                    if (pageText.length > 20) {
                        appLogger.debug(`✅ [多页处理] 第 ${pageIndex} 页识别成功，文字数: ${pageText.length}`);
                        appLogger.debug(`📄 [多页处理] 第 ${pageIndex} 页预览: ${pageText.substring(0, 100)}...`);
                        allText.push(pageText);
                    } else {
                        appLogger.warn(`⚠️ [多页处理] 第 ${pageIndex} 页识别文字过少: ${pageText.length}`);
                    }
                } else {
                    appLogger.error(`❌ [多页处理] 第 ${pageIndex} 页 OCR 识别失败`);
                    continue;
                }
                
                // 翻到下一页
                if (pageIndex < totalPages) {
                    appLogger.debug(`📖 [多页处理] 翻到下一页...`);
                    
                    // 方法1: 查找"下一页"按钮
                    const nextBtn = document.querySelector('[title="下一页"], .anim-btn2, [onclick*="nextPage"]');
                    if (nextBtn && nextBtn.offsetParent !== null) {
                        nextBtn.click();
                        appLogger.debug(`✅ [多页处理] 已点击下一页按钮`);
                    } else {
                        // 方法2: 发送PageDown键
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', code: 'PageDown' }));
                        appLogger.debug(`✅ [多页处理] 已发送PageDown键`);
                    }
                    
                    // 等待页面切换
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // 合并所有文本
            if (allText.length > 0) {
                const combinedText = allText.join('\\n\\n【第 ' + allText.indexOf(allText[0]) + ' 页开始】\\n\\n')
                    .split('【第').join('\\n\\n【第'); // 添加分页符
                appLogger.info(`✅ [多页处理] 完成！共提取 ${allText.length} 页，总长度: ${combinedText.length}`);
                showNotification(`✅ 文档识别完成（${allText.length} 页）`, '#4CAF50', 2000);
                return combinedText;
            } else {
                appLogger.error('❌ [多页处理] 未能识别任何页面');
                return '多页文档识别失败：无法识别任何页面';
            }
            
        } catch (error) {
            appLogger.error('❌ [多页处理] 处理失败:', error);
            showNotification('❌ 多页文档处理失败', '#FF5252', 2000);
            return '多页处理失败：' + error.message;
        }
    }
    
    // 处理 iframe 嵌入文档
    async function processIframeDocument() {
        try {
            appLogger.info('📄 [Iframe处理] 开始处理 iframe 文档...');
            
            // 只处理可能是文档预览的 iframe，避免抓到无关的UI框架
            const iframes = Array.from(document.querySelectorAll('iframe'));
            const docIframePatterns = ['doc', 'pdf', 'wps', 'viewer', 'preview', 'aliyuncs.com', 'imm.', 'hike-doc-online-h5.zhihuishu.com'];
            const candidates = iframes.filter((iframe) => {
                const src = (iframe.src || '').toLowerCase();
                const rect = iframe.getBoundingClientRect();
                const largeEnough = rect.width > 300 && rect.height > 300;
                const matches = docIframePatterns.some((p) => src.includes(p));
                return matches && largeEnough;
            });
            
            if (candidates.length === 0) {
                appLogger.debug('⚠️ [Iframe处理] 未找到可疑的文档预览 iframe，跳过直接提取');
            }
            
            const isLikelyDocumentText = (text) => {
                const normalized = (text || '').replace(/\s+/g, ' ').trim();
                if (normalized.length < 200) return false;
                const badMarkers = [
                    'outlineback to top', '导出', '主题', '快捷键', '帮助中心',
                    'clip', 'rss', 'podcast', 'premium', '账户', '设置', '语言'
                ];
                const lowered = normalized.toLowerCase();
                const badHits = badMarkers.filter((m) => lowered.includes(m)).length;
                const chineseCount = (normalized.match(/[\u4e00-\u9fff]/g) || []).length;
                return badHits < 2 && (chineseCount > 10 || normalized.length > 600);
            };
            
            // 尝试从候选 iframe 中提取文本内容
            for (let iframe of candidates) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        const text = iframeDoc.body?.innerText || iframeDoc.body?.textContent || '';
                        if (isLikelyDocumentText(text)) {
                            appLogger.info('✅ [Iframe处理] 成功提取文档 iframe 内容');
                            appLogger.debug('📄 [Iframe处理] 内容预览:', text.substring(0, 200));
                            return text;
                        }
                        appLogger.debug('⚠️ [Iframe处理] 提取到内容但疑似非文档，继续尝试下一个 iframe');
                    }
                } catch (e) {
                    // iframe 跨域无法访问，尝试下一个
                    appLogger.debug('⚠️ [Iframe处理] iframe 跨域限制，跳过该 iframe');
                }
            }
            
            // 使用 background 脚本在所有 iframe 中提取文本（绕过跨域限制）
            try {
                appLogger.debug('🧩 [Iframe处理] 尝试 background 脚本提取 iframe 正文...');
                const extracted = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({ action: 'extractIframeText' }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    });
                });
                if (extracted && extracted.success && extracted.text) {
                    const extractedText = extracted.text || '';
                    if (isLikelyDocumentText(extractedText)) {
                        appLogger.info('✅ [Iframe处理] 通过 background 提取 iframe 正文成功');
                        appLogger.debug('📄 [Iframe处理] 正文预览:', extractedText.substring(0, 200));
                        return extractedText;
                    }
                    appLogger.warn('⚠️ [Iframe处理] background 提取内容疑似为 UI/工具栏，忽略并继续');
                }
                appLogger.warn('⚠️ [Iframe处理] background 提取未返回有效正文');
            } catch (error) {
                appLogger.warn('⚠️ [Iframe处理] background 提取失败:', error.message);
            }
            
            // 如果无法直接访问，检查是否有阿里云预览器按钮
            appLogger.debug('🔍 [Iframe处理] 查找预览按钮...');
            const previewButtons = document.querySelectorAll('[class*="预览"], [class*="preview"], [title*="预览"], [title*="查看"]');
            if (previewButtons.length > 0) {
                appLogger.debug('🖱️ [Iframe处理] 尝试点击预览按钮打开文档...');
                previewButtons[0].click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // 如果无法直接访问，尝试截屏识别
            appLogger.info('📸 [Iframe处理] 无法直接提取，尝试截屏识别...');
            return await processCanvasDocument();
            
        } catch (error) {
            appLogger.error('❌ [Iframe处理] 处理失败:', error);
            return '文档处理失败：' + error.message;
        }
    }
    
    // 将图片转换为 base64 （改进版 - 支持跨域图片）
    function convertImageToBase64(img) {
        return new Promise((resolve, reject) => {
            try {
                // 如果图片已经是 base64 格式
                if (img.src.startsWith('data:')) {
                    resolve(img.src);
                    return;
                }
                
                // 方案1: 使用 Fetch API 获取图片 blob（解决跨域问题）
                appLogger.debug('📸 [图片转换] 使用 Fetch 获取跨域图片...');
                fetch(img.src, { 
                    mode: 'no-cors',
                    credentials: 'include'
                })
                .then(response => response.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        appLogger.debug('✅ [图片转换] Fetch方式成功');
                        resolve(e.target.result);
                    };
                    reader.onerror = function(error) {
                        appLogger.warn('⚠️ [图片转换] FileReader失败，尝试Canvas方案:', error);
                        fallbackToCanvas();
                    };
                    reader.readAsDataURL(blob);
                })
                .catch(error => {
                    console.warn('⚠️ [图片转换] Fetch失败:', error.message);
                    fallbackToCanvas();
                });
                
                // 备选方案: 使用 Canvas（仅用于同域图片）
                function fallbackToCanvas() {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        canvas.width = img.naturalWidth || img.width || 500;
                        canvas.height = img.naturalHeight || img.height || 500;
                        
                        // 为跨域图片添加crossOrigin属性
                        img.crossOrigin = 'anonymous';
                        
                        ctx.drawImage(img, 0, 0);
                        const dataURL = canvas.toDataURL('image/png');
                        appLogger.debug('✅ [图片转换] Canvas方式成功');
                        resolve(dataURL);
                    } catch (canvasError) {
                        console.error('❌ [图片转换] Canvas方式也失败:', canvasError);
                        reject(new Error('无法转换图片：' + canvasError.message));
                    }
                }
                
            } catch (error) {
                console.error('❌ [图片转换] 转换失败:', error);
                reject(error);
            }
        });
    }
    
    // 提取AI推荐评分
    function extractAIRecommendedScore() {
        const scoreElements = document.querySelectorAll('span');
        for (let el of scoreElements) {
            const text = el.textContent.trim();
            // 查找 "100" 这样的数字，并且后面跟着 "分"
            if (text.match(/^\d+$/) && el.nextSibling && el.nextSibling.textContent.includes('分')) {
                const score = parseInt(text);
                if (!isNaN(score) && score >= 0 && score <= 100) {
                    appLogger.debug(`✅ [自动批改] 提取到AI推荐分数: ${score}`);
                    return score;
                }
            }
        }
        return null;
    }
    
    // 智能生成评语
    async function generateSmartComment(score, standardAnswer, studentAnswer) {
        appLogger.info('🤖 [自动批改] 开始生成智能评语...');

        // 词汇选择题不写评语（需求约束）
        if (AUTO_GRADING_STATE.currentHomeworkType === HOMEWORK_TYPES.VOCAB_CHOICE) {
            appLogger.info('📭 [自动批改] 词汇选择题按照要求不生成评语');
            return '';
        }
        
        // ============ 检查是否使用分析条件 ============
        if (AUTO_GRADING_STATE.autoGradingConditions.isSet) {
            appLogger.info('🎯 [自动批改] 检测到分析条件已设置，优先使用分析条件生成评语');
            appLogger.debug('📊 [自动批改] 作业类型:', AUTO_GRADING_STATE.autoGradingConditions.homeworkType);
            return await generateCommentWithAnalysisConditions(score, standardAnswer, studentAnswer);
        }
        
        // ============ 原始逻辑（未设置分析条件时） ============
        appLogger.info('ℹ️ [自动批改] 未设置分析条件，使用默认逻辑');
        
        // 检测题目类型
        const isChoiceOrFillBlank = standardAnswer && (
            standardAnswer.includes('ABCD') || 
            standardAnswer.includes('abcd') ||
            /[1-9][\s\-:：.、]+[A-Da-d]/.test(standardAnswer)
        );
        
        if (isChoiceOrFillBlank) {
            // 选择填空题：分析错题
            appLogger.info('📝 [自动批改] 检测到选择/填空题');
            return generateChoiceComment(score, standardAnswer, studentAnswer);
        } else {
            // 作文题或其他：使用AI生成评语（即使没有设置评分标准）
            appLogger.info('📄 [自动批改] 检测到作文/问答题，调用AI生成评语...');
            
            // 使用默认的评分标准调用AI
            const defaultConditions = {
                homeworkType: '综合题',
                typeExplanation: '需要分析和论述的题目',
                gradingCriteria: [
                    '内容完整性：回答是否覆盖题目要求的要点',
                    '逻辑清晰度：论述是否有条理，逻辑是否通顺',
                    '语言表达：文字表达是否准确、规范'
                ],
                gradingAdvice: '根据答案的完整性、逻辑性和表达质量综合评分',
                commonMistakes: [
                    '要点遗漏或覆盖不全',
                    '表达不清或逻辑跳跃'
                ]
            };
            
            return await generateCommentWithAnalysisConditions(score, standardAnswer, studentAnswer, defaultConditions);
        }
    }
    
    // 使用分析条件生成评语（调用AI批改）
    async function generateCommentWithAnalysisConditions(score, standardAnswer, studentAnswer, customConditions = null) {
        // 优先使用传入的自定义条件，否则使用全局状态中的条件
        const conditions = customConditions || AUTO_GRADING_STATE.autoGradingConditions;
        
        appLogger.debug('📊 [评语生成] 使用作业类型:', conditions.homeworkType);
        appLogger.debug('📊 [评语生成] 学生答案长度:', studentAnswer?.length || 0);
        appLogger.debug('📊 [评语生成] 评分标准数量:', conditions.gradingCriteria?.length || 0);
        appLogger.debug('📊 [评语生成] 常见错误数量:', conditions.commonMistakes?.length || 0);
        appLogger.debug('📊 [评语生成] 使用条件来源:', customConditions ? '默认条件' : '用户设置');
        
        // ============ 调用AI批改 ============
        try {
            appLogger.info('🤖 [评语生成] 调用AI进行智能批改...');
            
            // 对于选择题，转换为格式化的答案对比
            let studentAnswerForAI = studentAnswer;
            let standardAnswerForAI = standardAnswer;
            
            if (conditions.homeworkType === '选择题' || conditions.homeworkType === HOMEWORK_TYPES.CHOICE) {
                // 解析答案对象，转换为易读格式
                const correctAnswers = parseAnswers(standardAnswer);
                const studentAnswers = parseAnswers(studentAnswer);
                
                if (Object.keys(correctAnswers).length > 0) {
                    // 生成对比格式
                    let standardStr = '';
                    let studentStr = '';
                    let correctCount = 0;
                    let totalCount = Object.keys(correctAnswers).length;
                    
                    for (let qNum = 1; qNum <= totalCount; qNum++) {
                        const correctAns = correctAnswers[qNum] || '?';
                        const studentAns = studentAnswers[qNum] || '未答';
                        const isCorrect = correctAns === studentAns;
                        if (isCorrect) correctCount++;
                        
                        standardStr += `${qNum}:${correctAns} `;
                        studentStr += `${qNum}:${studentAns}${isCorrect ? '✓' : '✗'} `;
                    }
                    
                    const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
                    standardAnswerForAI = `标准答案（共${totalCount}题）：${standardStr}`;
                    studentAnswerForAI = `学生答案（${correctCount}/${totalCount}题正确，正确率${accuracy}%）：${studentStr}`;
                    
                    appLogger.debug(`📊 [评语生成] 选择题格式化完成：${correctCount}/${totalCount}正确`);
                }
            }
            
            const gradingData = {
                studentAnswer: studentAnswerForAI || '学生未提交答案',
                standardAnswer: standardAnswerForAI || '',
                conditions: conditions,
                maxScore: 100,
                score: score  // 明确传入分数，避免AI自己算
            };
            
            // 调用background的AI批改功能
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'gradeStudentHomework',
                    data: gradingData
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else if (response && response.success) {
                        resolve(response.grading);
                    } else {
                        reject(new Error(response?.error || 'AI批改失败'));
                    }
                });
            });
            
            appLogger.info('✅ [评语生成] AI批改成功');
            appLogger.debug('📊 [评语生成] AI评分:', response.score);
            appLogger.debug('📝 [评语生成] AI评语长度:', response.comment?.length || 0);
            appLogger.debug('📋 [评语生成] 详细评分细则数量:', response.criteriaScores?.length || 0);

            // 将最新的AI结果存入状态，便于班级统计
            AUTO_GRADING_STATE.lastAIGradingResult = response;
            
            // 更新全局状态中的分数（让后续流程使用AI的评分）
            AUTO_GRADING_STATE.currentScore = response.score;
            
            // ============ 格式化评语：包含详细评分细则 ============
            let comment = '';
            
            // 判断是否为选择题格式
            const isChoiceFormat = response.correctCount !== undefined && response.totalCount !== undefined;
            
            if (isChoiceFormat) {
                // ========== 选择题格式 ==========
                comment += '📊 答题统计：\n';
                comment += `总题数：${response.totalCount}道\n`;
                comment += `答对：${response.correctCount}道\n`;
                comment += `正确率：${response.accuracy}%\n\n`;

                if (AUTO_GRADING_STATE.currentHomeworkType === HOMEWORK_TYPES.READING_CHOICE) {
                    const diagnosis = generateReadingChoiceDiagnosis(response);
                    if (diagnosis) {
                        comment += '📖 阅读理解诊断：\n';
                        comment += diagnosis + '\n\n';
                    }
                }
                
                // 显示总体评价
                if (response.overallComment) {
                    comment += '📝 老师评价：\n' + response.overallComment + '\n\n';
                }
                
                // 显示错题详情
                if (response.wrongQuestions && response.wrongQuestions.length > 0) {
                    comment += '❌ 错题分析（共' + response.wrongQuestions.length + '道错题）：\n\n';
                    
                    response.wrongQuestions.forEach((item, index) => {
                        comment += `第${item.questionNumber}题：\n`;
                        comment += `  你的答案：${item.studentAnswer}\n`;
                        comment += `  正确答案：${item.correctAnswer}\n`;
                        comment += `  原因分析：${item.mistake}\n`;
                        comment += `  知识讲解：${item.explanation}\n\n`;
                    });
                }
                
                // 显示改进建议
                if (response.improvementAreas && response.improvementAreas.length > 0) {
                    comment += '💡 改进建议：\n';
                    response.improvementAreas.forEach(area => comment += `• ${area}\n`);
                    comment += '\n';
                }
                
                // 显示鼓励
                if (response.encouragement) {
                    comment += '💪 ' + response.encouragement + '\n\n';
                }
                
            } else {
                // ========== 作文/分析题格式 ==========
                // 1. 如果有详细的评分细则，先展示各项得分
                if (response.criteriaScores && response.criteriaScores.length > 0) {
                    comment += '📊 各项评分细则：\n\n';
                    
                    response.criteriaScores.forEach((item, index) => {
                        const percentage = item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 100) : 0;
                        comment += `${index + 1}. ${item.criterion}\n`;
                        comment += `   得分：${item.score}/${item.maxScore}分 (${percentage}%)\n`;
                        
                        if (item.performance) {
                            comment += `   表现：${item.performance}\n`;
                        }
                        
                        if (item.improvement && item.score < item.maxScore) {
                            comment += `   ⚠️ 改进建议：${item.improvement}\n`;
                        }
                        
                        comment += '\n';
                    });
                }
                
                // 2. 总体评价
                if (response.comment) {
                    comment += '📝 总体评价：\n' + response.comment + '\n\n';
                }
                
                // 3. 需要改进的薄弱环节（先改进后肯定）
                if (response.weaknesses && response.weaknesses.length > 0) {
                    comment += '⚠️ 薄弱环节需要加强：\n';
                    response.weaknesses.forEach(w => comment += `• ${w}\n`);
                    comment += '\n';
                }

                // 4. 优点
                if (response.strengths && response.strengths.length > 0) {
                    comment += '✅ 做得好的地方：\n';
                    response.strengths.forEach(s => comment += `• ${s}\n`);
                    comment += '\n';
                }
                
                // 5. 分层反馈与情感支持
                if (response.feedbackTier) {
                    const tierLabel = response.feedbackTier === 'advanced' ? '高阶挑战' : response.feedbackTier === 'improver' ? '优化建议' : '基础巩固';
                    comment += `🎯 分层反馈（${tierLabel}）：${response.tierRationale || ''}\n`;
                    if (response.feedbackTier === 'starter') {
                        comment += '• 优先修正语法、拼写、时态等基础问题\n';
                    } else if (response.feedbackTier === 'improver') {
                        comment += '• 关注结构、衔接与表达的丰富度\n';
                    } else if (response.feedbackTier === 'advanced') {
                        comment += '• 尝试更深的论证、批判性与创造性\n';
                    }
                    comment += '\n';
                }

                if (response.emotionalSupport) {
                    comment += '💖 情感支持：' + response.emotionalSupport + '\n\n';
                }

                // 6. 逻辑追问与文化提示
                if (response.logicQuestions && response.logicQuestions.length > 0) {
                    comment += '🤔 逻辑追问（帮你自我反思）：\n';
                    response.logicQuestions.slice(0, 3).forEach(q => comment += `• ${q}\n`);
                    comment += '\n';
                }

                if (response.cultureTips && response.cultureTips.length > 0) {
                    comment += '🌏 地道表达与文化提示：\n';
                    response.cultureTips.slice(0, 3).forEach(t => comment += `• ${t}\n`);
                    comment += '\n';
                }

                // 7. 常见错误归类
                if (response.commonErrorCategories && response.commonErrorCategories.length > 0) {
                    comment += '📌 错误归类：\n';
                    response.commonErrorCategories.slice(0, 4).forEach(item => {
                        comment += `• ${item.category || '问题'}（出现${item.count || 1}次）\n`;
                    });
                    comment += '\n';
                }

                // 8. 练习/微课推荐
                if (response.practiceRecommendations && response.practiceRecommendations.length > 0) {
                    comment += '📺 练习/微课推荐：\n';
                    response.practiceRecommendations.slice(0, 3).forEach(p => {
                        if (typeof p === 'string') {
                            comment += `• ${p}\n`;
                        } else {
                            comment += `• ${p.title || '练习'} — ${p.focus || ''}\n`;
                        }
                    });
                    comment += '\n';
                }

                // 9. 修改后参考答案
                // 5. 修改后参考答案
                if (response.revisedAnswer) {
                    comment += '📝 修改后参考答案：\n';
                    comment += response.revisedAnswer + '\n\n';
                }
            }
            
            // 6. AI生成检测（两种题型都支持）
            if (response.aiGeneratedAnalysis) {
                const analysis = response.aiGeneratedAnalysis;
                const probability = analysis.probability || 0;
                
                comment += '🤖 AI生成检测：\n';
                
                // 根据概率显示不同的提示
                if (probability >= 80) {
                    comment += `⚠️ 高度疑似AI生成（${probability}%）\n`;
                } else if (probability >= 50) {
                    comment += `⚠️ 可能含有AI生成内容（${probability}%）\n`;
                } else if (probability >= 30) {
                    comment += `✓ 较低AI生成可能性（${probability}%）\n`;
                } else {
                    comment += `✅ 基本为原创内容（AI生成可能性：${probability}%）\n`;
                }
                
                if (analysis.reasons && analysis.reasons.length > 0) {
                    comment += '判断依据：\n';
                    analysis.reasons.forEach(reason => comment += `  • ${reason}\n`);
                }
                
                comment += '\n';
            }

            // AI使用指导
            if (response.aiUseGuidance) {
                comment += '🧭 AI使用提醒：' + response.aiUseGuidance + '\n\n';
            }

            // 可疑AI句子标记
            if (response.suspectedAISentences && response.suspectedAISentences.length > 0) {
                comment += '🔍 疑似AI句子与人工表达建议：\n';
                response.suspectedAISentences.slice(0, 3).forEach((s, idx) => {
                    comment += `${idx + 1}. 原句：${s.sentence || ''}\n   理由：${s.reason || ''}\n   人工表达：${s.humanSuggestion || ''}\n`;
                });
                comment += '\n';
            }

            // 徽章提示
            if (response.badgeCandidates && response.badgeCandidates.length > 0) {
                comment += '🏅 可能获得的徽章：' + response.badgeCandidates.slice(0, 3).join('、') + '\n\n';
            }

            // 长期能力方向
            if (response.longTermHint) {
                comment += '📈 长期改进方向：' + response.longTermHint + '\n\n';
            }

            // 控制评语长度（约200词以内）
            const words = comment.split(/\s+/);
            if (words.length > 210) {
                comment = words.slice(0, 210).join(' ');
                comment += '\n...';
            }


                        appLogger.debug('✅ [评语生成] 最终评语长度:', comment.length);
            return comment;
            
        } catch (error) {
            console.error('❌ [评语生成] AI批改失败:', error);
                        appLogger.warn('⚠️ [评语生成] 回退到简单评语生成');
            
            // 回退到简单评语生成
            let comment = '';
            
            // 根据分数评价
            if (score >= 90) {
                comment += '优秀！';
            } else if (score >= 80) {
                comment += '良好！';
            } else if (score >= 70) {
                comment += '中等水平。';
            } else if (score >= 60) {
                comment += '及格。';
            } else {
                comment += '需要改进。';
            }
            
            // 添加批改建议
            if (conditions.gradingAdvice) {
                const advice = conditions.gradingAdvice.substring(0, 100);
                comment += ` ${advice}`;
                if (conditions.gradingAdvice.length > 100) {
                    comment += '...';
                }
            }
            
            // 添加常见错误提示
            if (conditions.commonMistakes && conditions.commonMistakes.length > 0 && score < 90) {
                const mistakes = conditions.commonMistakes.slice(0, 2);
                comment += ` 注意避免：${mistakes.join('；')}`;
            }
            
            return comment;
        }
    }
    
    // 生成选择填空题评语
    function generateChoiceComment(score, standardAnswer, studentAnswer) {
        if (score >= 95) {
            return '全部正确，非常优秀！继续保持！';
        }
        
        try {
            // 解析标准答案
            const correctAnswers = parseAnswers(standardAnswer);
            const studentAnswers = parseAnswers(studentAnswer);
            
            const wrongQuestions = [];
            
            // 对比答案
            for (let qNum in correctAnswers) {
                if (studentAnswers[qNum] && 
                    correctAnswers[qNum].toUpperCase() !== studentAnswers[qNum].toUpperCase()) {
                    wrongQuestions.push(qNum);
                }
            }
            
            if (wrongQuestions.length > 0) {
                return `第 ${wrongQuestions.join('、')} 题答错了，注意修改。正确答案请参考标准答案。`;
            } else {
                return '大部分正确，个别小错误，注意细节！';
            }
        } catch (error) {
            console.warn('⚠️ [自动批改] 解析答案失败，使用默认评语');
            return score >= 80 ? '整体不错，继续努力！' : '存在部分错误，请仔细检查答案！';
        }
    }

    function generateReadingChoiceDiagnosis(response) {
        const buckets = {
            detail: 0,
            mainIdea: 0,
            attitude: 0
        };

        const wrongItems = response.wrongQuestions || [];
        wrongItems.forEach(item => {
            const text = `${item.explanation || ''} ${item.mistake || ''}`.toLowerCase();
            if (/细节|detail|定位|事实|信息/.test(text)) buckets.detail += 1;
            if (/主旨|main\s*idea|中心|段落大意|标题/.test(text)) buckets.mainIdea += 1;
            if (/态度|情感|语气|立场|attitude|tone|stance/.test(text)) buckets.attitude += 1;
        });

        const result = [];
        const major = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
        if (major && major[1] > 0) {
            if (major[0] === 'detail') {
                result.push('你在主旨和态度类题目上有进步空间，尤其要避免忽略上下文推断。');
            } else if (major[0] === 'mainIdea') {
                result.push('你在细节定位方面基础不错，但主旨大意把握还需加强。');
            } else {
                result.push('你在细节题上表现较稳，作者态度/语气/立场判断需要多练习。');
            }
        }

        if (response.accuracy >= 80) {
            result.push('整体正确率较高，建议继续巩固易错题型。');
        } else {
            result.push('建议按“细节定位→主旨归纳→态度判断”三步法复盘错题。');
        }

        return result.join(' ');
    }
    
    // 解析答案字符串为对象 {题号: 答案}
    function parseAnswers(answerStr) {
        const answers = {};
        if (!answerStr) return answers;

        // ============ 第一步：规范化 ============
        let normalized = answerStr
            .replace(/\b(Vocabulary\s+Test|Unite\d+|Unit\d+|U\d+|Chapter|第|单元|章节)\s*[:：]?\s*/gi, '')
            .replace(/[（(].*?[）)]/g, '')
            .replace(/题号|题答案|答案/g, '')
            .replace(/[，,、]/g, ' ')
            .replace(/[–—−]/g, '-')
            .replace(/[题]/g, '')
            .replace(/\b\d+\s*[:：]\s*(?=\d+\s*[-~])/g, '')
            .replace(/[\n\r]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        appLogger.debug(`🔍 [答案解析] 规范化后: ${normalized}`);
        
        // ============ 第二步：提取所有范围块 ============
        const rangePattern = /(\d+)\s*[-~–—−]\s*(\d+)[\s\.\-:：]*([A-Da-d\s]*)/g;
        const ranges = [];
        let match;
        
        while ((match = rangePattern.exec(normalized)) !== null) {
            const start = parseInt(match[1]);
            const end = parseInt(match[2]);
            const answerSeq = match[3].replace(/\s+/g, '').toUpperCase();
            
            if (answerSeq) {
                ranges.push({ start, end, answers: answerSeq });
            }
        }
        
        appLogger.debug(`📋 [答案解析] 检测到 ${ranges.length} 个范围块`);
        
        // ============ 第三步：智能偏移（检测重复范围） ============
        const seenRanges = new Set(); // 记录已出现过的范围
        let firstBatchMaxEnd = 0; // 第一批的最大结束题号
        let batchOffset = 0; // 当前批次的偏移量
        let inSecondBatch = false;
        
        for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            const rangeKey = `${range.start}-${range.end}`;
            
            // 检测是否是重复范围（进入第二批）
            if (seenRanges.has(rangeKey) && !inSecondBatch) {
                inSecondBatch = true;
                batchOffset = firstBatchMaxEnd;
                appLogger.debug(`🔄 [答案解析] 检测到重复范围 ${rangeKey}，进入第二批，统一偏移 ${batchOffset}`);
            }
            
            // 应用偏移
            range.offset = batchOffset;
            
            // 记录范围
            seenRanges.add(rangeKey);
            
            // 更新第一批的最大结束题号
            if (!inSecondBatch) {
                const actualEnd = range.end;
                if (actualEnd > firstBatchMaxEnd) {
                    firstBatchMaxEnd = actualEnd;
                }
            }
        }
        
        // ============ 第四步：填充答案（只填实际有的） ============
        for (const range of ranges) {
            const start = range.start + range.offset;
            const end = range.end + range.offset;
            const expectedLength = end - start + 1;
            const actualLength = range.answers.length;
            
            if (actualLength < expectedLength) {
                console.warn(`⚠️ [答案解析] 范围 ${range.start}-${range.end} 答案不足: 期望${expectedLength}个，实际${actualLength}个`);
            }
            
            // 只填充实际存在的答案，不足的留空
            for (let i = 0; i < actualLength; i++) {
                const qNum = start + i;
                if (range.answers[i] && /[A-D]/i.test(range.answers[i])) {
                    answers[qNum] = range.answers[i];
                    appLogger.debug(`✅ [答案解析] 题${qNum} = ${range.answers[i]}`);
                }
            }
            
            // 标记缺失的题号（用于诊断）
            for (let i = actualLength; i < expectedLength; i++) {
                const qNum = start + i;
                appLogger.debug(`⚠️ [答案解析] 题${qNum} = [空]`);
            }
        }
        
        // ============ 第五步：无有效范围/答案时，提取所有字母按顺序排列 ============
        if (Object.keys(answers).length === 0) {
            appLogger.debug('ℹ️ [答案解析] 未检测到有效范围/答案，尝试提取纯字母序列...');
            
            // 先尝试纯字母序列（忽略所有非字母字符，从1开始按顺序排列）
            const pureLetters = normalized.replace(/[^A-Da-d]/gi, '').toUpperCase();
            if (pureLetters.length >= 3 && /^[A-D]+$/.test(pureLetters)) {
                appLogger.debug(`📝 [答案解析] 检测到纯字母序列（忽略所有非字母元素）: ${pureLetters}`);
                for (let i = 0; i < pureLetters.length; i++) {
                    answers[i + 1] = pureLetters[i];
                }
                appLogger.debug(`✅ [答案解析] 按顺序排列，共 ${pureLetters.length} 题`);
            } else {
                // 纯字母提取失败，再尝试单题格式（带题号）
                const singlePattern = /(\d+)[\s\.\-:：、]+([A-Da-d])/gi;
                while ((match = singlePattern.exec(normalized)) !== null) {
                    const qNum = parseInt(match[1]);
                    const answer = match[2].toUpperCase();
                    answers[qNum] = answer;
                    appLogger.debug(`✅ [答案解析] 单题: 题${qNum} = ${answer}`);
                }
            }
        }
        
        appLogger.debug(`📊 [答案解析] 解析完成，共 ${Object.keys(answers).length} 题:`, answers);
        return answers;
    }
    
    // ============ 辅助函数：智能补充题号 ============
    // 接收已解析的标准答案对象，避免重复解析
    function supplementMissingQuestionNumbers(studentAnswers, standardAnswersObj) {
        try {
            // standardAnswersObj 应该是已解析的答案对象 {1: 'A', 2: 'B', ...}
            if (!standardAnswersObj || Object.keys(standardAnswersObj).length === 0) {
                appLogger.debug('📌 [题号补充] 标准答案对象为空，无法补充');
                return studentAnswers;
            }
            
            const totalQuestions = Object.keys(standardAnswersObj).map(n => parseInt(n));
            const maxExpectedQNum = Math.max(...totalQuestions);
            const actualQNums = Object.keys(studentAnswers).map(n => parseInt(n)).sort((a, b) => a - b);
            const actualAnswerCount = Object.keys(studentAnswers).length;
            
            // 如果学生答案数严重不足，尝试自动补充
            if (actualQNums.length > 0 && actualAnswerCount < maxExpectedQNum * 0.7) {
                console.warn(`⚠️ [题号补充] 检测到学生答案严重不足: ${actualAnswerCount}/${maxExpectedQNum}`);
                
                // 情景分析：如果学生答案数量大约是题目数的40%~70%，
                // 可能是因为答案格式分散（如多个范围），每个范围内缺少部分答案
                // 策略：按顺序从现有答案补充，并根据标准答案的差异推断
                
                const sortedStandardQNums = totalQuestions.sort((a, b) => a - b);
                const supplementedAnswers = { ...studentAnswers };
                let answerValueIdx = 0;
                const answerValues = actualQNums.map(qNum => studentAnswers[qNum]);
                
                // 逐个题号检查，如果缺失则尝试补充
                for (let qNum of sortedStandardQNums) {
                    if (!supplementedAnswers[qNum] && answerValueIdx < answerValues.length) {
                        // 如果当前题号缺失，但还有未使用的答案值，尽量补充
                        const candidateAnswer = answerValues[answerValueIdx];
                        if (candidateAnswer && /^[A-Da-d]$/.test(candidateAnswer)) {
                            supplementedAnswers[qNum] = candidateAnswer;
                            answerValueIdx++;
                            appLogger.debug(`✅ [题号补充] 题${qNum}: 补充答案 "${candidateAnswer}"`);
                        }
                    }
                }
                
                // 如果仍有缺失，记录为调试信息
                const stillMissing = sortedStandardQNums.filter(qNum => !supplementedAnswers[qNum]);
                if (stillMissing.length > 0) {
                    appLogger.debug(`ℹ️ [题号补充] 仍有 ${stillMissing.length} 题未能补充: ${stillMissing.slice(0, 5).join(', ')}${stillMissing.length > 5 ? '...' : ''}`);
                }
                
                return supplementedAnswers;
            }
            
            return studentAnswers;
        } catch (error) {
            console.warn('⚠️ [题号补充] 补充失败:', error);
            return studentAnswers;
        }
    }
    
    // 提取AI生成的评语（用于作文等主观题）
    function extractAIComment() {
        const allDivs = document.querySelectorAll('div');
        for (let div of allDivs) {
            if (div.textContent.includes('AI评分理由') || div.textContent.includes('总体评价')) {
                // 查找该区域下的评语文本
                const comments = div.querySelectorAll('p');
                if (comments.length > 0) {
                    // 获取最长的评语文本（通常是最全面的）
                    let longestComment = '';
                    for (let comment of comments) {
                        const text = comment.textContent.trim();
                        if (text.length > longestComment.length && 
                            text.length > 20 &&  // 至少20字符
                            !text.includes('本题得分') &&
                            !text.includes('满分') &&
                            !/^[\d\-:：.、A-Da-d\s]+$/.test(text)) {  // 不是纯答案格式
                            longestComment = text;
                        }
                    }
                    if (longestComment) {
                        appLogger.debug(`✅ [自动批改] 提取到AI评语: ${longestComment.substring(0, 50)}...`);
                        return longestComment.substring(0, 500); // 限制长度
                    }
                }
            }
        }
        
        // 如果没找到AI评语，返回鼓励性评语
        return '作业完成认真，继续保持！如有问题请及时复习相关知识点。';
    }
    
    // 保存/提交评分
    function submitGrade() {
        appLogger.debug('💾 [自动批改] 尝试保存评分...');
        
        // 查找保存按钮（通常在页面的右下角或底部）
        const buttons = document.querySelectorAll('button');
        for (let btn of buttons) {
            const text = btn.textContent.toLowerCase();
            if (text.includes('保存') || text.includes('提交') || text.includes('确定')) {
                btn.click();
                appLogger.debug('✅ [自动批改] 已点击保存按钮');
                return true;
            }
        }
        
        console.warn('⚠️ [自动批改] 未找到保存按钮，跳过保存');
        return false;
    }
    
    // 自动关闭"作业催交"等弹窗
    function autoCloseIntrruptDialogs() {
        try {
            // 查找"作业催交"弹窗
            const messageBoxes = document.querySelectorAll('.el-message-box');
            
            for (let box of messageBoxes) {
                const titleEl = box.querySelector('.el-message-box__title');
                if (titleEl && titleEl.textContent.includes('作业催交')) {
                    appLogger.debug('🔔 [自动批改] 检测到"作业催交"弹窗，自动点击"不催"');
                    
                    // 查找"不催"按钮
                    const buttons = box.querySelectorAll('.el-button');
                    for (let btn of buttons) {
                        if (btn.textContent.includes('不催')) {
                            btn.click();
                            appLogger.debug('✅ [自动批改] 已自动点击"不催"按钮');
                            return true;
                        }
                    }
                }
            }
            
            return false;
        } catch (error) {
            console.error('❌ [自动批改] 关闭弹窗失败:', error);
            return false;
        }
    }

    // 点击返回按钮返回作业详情页面
    function clickReturnButton() {
        return new Promise((resolve) => {
            appLogger.info('🔙 [自动批改] 正在返回作业详情页面...');
            
            try {
                // 通过当前URL提取作业ID，直接返回到详情页
                const currentUrl = window.location.href;
                appLogger.debug(`📍 [自动批改] 当前URL: ${currentUrl}`);
                appLogger.debug('🔙 [自动批改] 准备返回作业详情页面...');
                
                // 从URL中提取作业ID
                // 格式: .../homeworkCorrect/homeworkId/studentId/pageNum
                let homeworkId = null;
                
                // 正则配合多种可能的格式
                const match1 = currentUrl.match(/homeworkCorrect\/(\d+)(?:\/|$)/);
                const match2 = currentUrl.match(/homeworkCorrection\/([^/?]+)/);
                const match3 = currentUrl.match(/correct\/(\d+)(?:\/|$)/);
                
                if (match1) {
                    homeworkId = match1[1];
                    appLogger.debug(`✅ [自动批改] 提取homeworkId: ${homeworkId}`);
                } else if (match2) {
                    homeworkId = match2[1];
                    appLogger.debug(`✅ [自动批改] 提取homeworkId: ${homeworkId}`);
                } else if (match3) {
                    homeworkId = match3[1];
                    appLogger.debug(`✅ [自动批改] 提取homeworkId: ${homeworkId}`);
                }
                
                if (homeworkId) {
                    const origin = window.location.origin || 'https://hike-teaching-center.polymas.com';
                    const returnUrl = `${origin}/pre-space-hike/homeworkDetails/${homeworkId}`;
                    appLogger.info(`🔗 [自动批改] 跳转URL: ${returnUrl}`);
                    window.location.href = returnUrl;
                    setTimeout(() => resolve(), 3000);
                    return;
                }

                // 方式2: 如果提取失败，尝试点击返回按钮
                console.warn('⚠️ [自动批改] 未从URL提取到作业ID，尝试查找返回按钮');
                let returnBtn = null;
                
                // 查找包含 cursor-pointer 和 flex 的 div（返回按钮特征）
                const cursorPointerElements = document.querySelectorAll('div.cursor-pointer.flex');
                for (let el of cursorPointerElements) {
                    const img = el.querySelector('img');
                    if (img && el.offsetParent !== null) {
                        returnBtn = el;
                        appLogger.debug('✅ [自动批改] 找到返回按钮');
                        break;
                    }
                }
                
                if (returnBtn) {
                    appLogger.debug('🖱️ [自动批改] 点击返回按钮');
                    returnBtn.click();
                    setTimeout(() => {
                        appLogger.debug('✅ [自动批改] 已点击返回按钮');
                        resolve();
                    }, 2000);
                } else {
                    // 方式3: 使用浏览器返回功能
                    console.warn('⚠️ [自动批改] 未找到返回按钮，使用浏览器返回');
                    window.history.back();
                    setTimeout(() => resolve(), 2000);
                }
            } catch (error) {
                console.error('❌ [自动批改] 返回过程出错:', error);
                // 备用方案：返回上一页
                window.history.back();
                setTimeout(() => resolve(), 2000);
            }
        });
    }

    // 点击"批阅完成"按钮自动切换到下一个学生
    function clickCompleteGradingButton() {
        return new Promise((resolve) => {
            appLogger.debug('🎯 [自动批改] 正在查找"批阅完成"按钮...');
            
            try {
                // 先尝试关闭可能的干扰弹窗
                autoCloseIntrruptDialogs();
                
                let completeBtn = null;
                
                // 方式 1: 查找包含"批阅完成"文字的元素（优先查找 correct-btn 类）
                const correctBtns = document.querySelectorAll('.correct-btn');
                for (let btn of correctBtns) {
                    if (btn.textContent.includes('批阅完成')) {
                        completeBtn = btn;
                        appLogger.debug('✅ [自动批改] 找到"批阅完成"按钮（通过 .correct-btn）');
                        break;
                    }
                }
                
                // 方式 2: 查找任何包含"批阅完成"文字的元素
                if (!completeBtn) {
                    const allElements = document.querySelectorAll('*');
                    for (let el of allElements) {
                        if (el.textContent.trim() === '批阅完成' && el.offsetParent !== null) {
                            completeBtn = el;
                            appLogger.debug('✅ [自动批改] 找到"批阅完成"按钮（通过文本查询）');
                            break;
                        }
                    }
                }
                
                // 方式 3: 查找可点击的容器
                if (!completeBtn) {
                    const clickableElements = document.querySelectorAll('[class*="cursor-pointer"]');
                    for (let el of clickableElements) {
                        if (el.textContent.includes('批阅')) {
                            completeBtn = el;
                            appLogger.debug('✅ [自动批改] 找到批阅相关按钮');
                            break;
                        }
                    }
                }
                
                if (completeBtn && completeBtn.offsetParent !== null) {
                    appLogger.debug('🖱️ [自动批改] 点击"批阅完成"按钮');
                    completeBtn.click();
                    
                    setTimeout(() => {
                        appLogger.debug('✅ [自动批改] 已点击"批阅完成"，等待页面切换...');
                        resolve();
                    }, 2000);
                } else {
                    console.warn('⚠️ [自动批改] 未找到"批阅完成"按钮，尝试返回');
                    clickReturnButton().then(() => resolve());
                }
            } catch (error) {
                console.error('❌ [自动批改] 点击"批阅完成"出错:', error);
                setTimeout(() => resolve(), 2000);
            }
        });
    }
    
    // 执行完整的自动批改流程
    async function executeAutoGradingFlow(studentList) {
        appLogger.info('🚀 [自动批改] 开始自动批改流程...');

        // 根据设置过滤需要批改的学生：默认只批已提交且未批改
        const filteredList = studentList.filter((student) => {
            // 必须先检查是否已提交
            const hasSubmission = !!student.hasSubmission;
            if (!hasSubmission) {
                return false;  // 未提交的学生不批改
            }
            
            // 如果包括已批阅的作业，则包含所有已提交的学生
            if (AUTO_GRADING_STATE.includeReviewedSubmissions) {
                return true;
            }
            
            // 否则只包括未批改的学生
            const isReviewed = student.status && student.status.includes('已批');
            return !isReviewed;
        });

        if (filteredList.length === 0) {
            showNotification('⚠️ 没有符合条件的学生可批改', '#FF9800');
            console.warn('⚠️ [自动批改] 过滤后学生列表为空');
            return;
        }
        
        // ============ 清空缓存，确保每次都重新提取答案 ============
        appLogger.debug('🔄 [自动批改] 清空缓存，准备重新提取答案...');
        AUTO_GRADING_STATE.standardAnswer = null;
        AUTO_GRADING_STATE.studentAnswer = null;

        let detectedHomeworkType = null;  // 在第一个学生处理时检测作业类型

        if (!AUTO_GRADING_STATE.standardAnswer) {
            const prefetchAnswer = extractStandardAnswer();
            if (prefetchAnswer) {
                AUTO_GRADING_STATE.standardAnswer = prefetchAnswer;
                appLogger.debug(`✅ [自动批改] 已缓存参考答案`);
            }
        }
        
        showFloatingPanel('自动批改进行中', '#FF9800', buildAutoGradeProgressPanelHTML());
        
        for (let i = 0; i < filteredList.length; i++) {
            // ============ 检查暂停状态 - 开始处理新学生前 ============
            while (AUTO_GRADING_STATE.isPaused) {
                appLogger.debug('⏸️ [自动批改] 已暂停，等待恢复...');
                // 更新进度条显示暂停状态
                const progressEl = document.getElementById('zh-auto-grade-progress');
                if (progressEl) {
                    progressEl.textContent = `⏸️ 已暂停 - 进度: ${i}/${filteredList.length}`;
                    progressEl.style.color = AUTO_GRADE_PANEL_STYLE_TEMPLATES.progressColorPaused;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const student = filteredList[i];
            
            // ============ 关键：再次验证学生是否已提交 ============
            if (!student.hasSubmission) {
                console.warn(`⚠️ [自动批改] ${student.name} 未提交作业，跳过`);
                continue;
            }
            
            const progress = `${i + 1}/${filteredList.length} - ${student.name}`;
            
            appLogger.info(`\n========== [${i + 1}/${filteredList.length}] ${student.name} ==========`);
            updateProgressBar(i + 1, filteredList.length, progress);
            
            // 每个学生开始前清空学生答案缓存
            AUTO_GRADING_STATE.studentAnswer = null;
            
            // 每个学生开始前检查并关闭弹窗
            autoCloseIntrruptDialogs();
            
            try {
                // 1. 点击学生进入批改界面
                await clickStudentToEnter(student);
                
                // 检查暂停 - 进入学生页面后
                while (AUTO_GRADING_STATE.isPaused) {
                    appLogger.debug('⏸️ [自动批改] 已暂停（进入学生页面后）');
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // 2. 等待页面完全加载（包括文档预览窗口）
                appLogger.debug('⏳ [自动批改] 等待页面和文档预览加载...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // 增加到5秒，确保所有文档和附件加载完成
                
                // 3. 提取答案
                const standardAnswer = extractStandardAnswer();
                let studentAnswer = extractStudentAnswer();
                
                // ============ 处理附件情况 ============
                if (studentAnswer && studentAnswer.startsWith('[[') && studentAnswer.endsWith(']]')) {
                    appLogger.info('📎 [自动批改] 检测到附件标记:', studentAnswer);
                    
                    if (studentAnswer === '[[IMAGE_ATTACHMENT_DETECTED]]') {
                        appLogger.info('📸 [自动批改] 学生提交了图片附件，尝试 OCR 识别...');
                        studentAnswer = await processImageAttachment();
                    } else if (studentAnswer === '[[CANVAS_DOCUMENT_DETECTED]]') {
                        appLogger.info('🎨 [自动批改] 学生提交了 Canvas 文档（可能是 WPS），尝试截屏识别...');
                        studentAnswer = await processCanvasDocument();
                    } else if (studentAnswer === '[[IFRAME_DOCUMENT_DETECTED]]') {
                        appLogger.info('📄 [自动批改] 学生提交了嵌入文档，尝试提取内容...');
                        studentAnswer = await processIframeDocument();
                    } else if (studentAnswer === '[[DOWNLOAD_LINK_DETECTED]]') {
                        appLogger.info('🔗 [自动批改] 学生提交了下载链接');
                        showNotification('❌ 检测到下载附件，请手动下载查看并批改', '#FF5252', 3000);
                        continue; // 跳过这个学生，进入下一个
                    }
                    
                    // 如果处理失败，studentAnswer 会是空或错误信息
                    if (!studentAnswer || 
                        studentAnswer.includes('失败') || 
                        studentAnswer.includes('异常') ||
                        studentAnswer.includes('手动批改') ||
                        studentAnswer.includes('建议手动')) {
                        console.error('❌ [自动批改] 附件处理失败，跳过该学生');
                        showNotification(`⏭️ ${student.name} 的附件无法自动识别，已跳过（请手动查看）`, '#FF9800', 2500);
                        continue; // 跳过这个学生
                    }
                    
                    appLogger.info(`✅ [自动批改] 附件处理成功，提取内容长度: ${studentAnswer.length}`);
                }
                
                // 4. 如果标准答案和学生答案都为空，跳过，避免误判
                if (!standardAnswer && !studentAnswer) {
                    console.warn('⚠️ [自动批改] 未提取到作业内容，可能是附件未打开，跳过该学生');
                    showNotification(`⏭️ ${student.name} 未获取到作业内容，已跳过`, '#FF9800', 2000);
                    continue;
                }
            
                // 5. 第一个学生时检测作业类型
                if (i === 0 && !detectedHomeworkType) {
                    detectedHomeworkType = detectHomeworkType(standardAnswer, studentAnswer);
                }

                // 将当前作业类型存入状态，便于评语逻辑使用
                AUTO_GRADING_STATE.currentHomeworkType = detectedHomeworkType;
                
                // 5. 根据作业类型进行批改
                let score = 0;
                let comment = '';
                const ruleScoreDetails = [];
                
                // 如果缺少标准答案，避免误判选择/填空题
                const studentText = (studentAnswer || '').trim();
                const hasEssaySignals = studentText.length > 120 || /[\u4e00-\u9fff]{20,}/.test(studentText);
                if (!standardAnswer && (detectedHomeworkType === HOMEWORK_TYPES.CHOICE || detectedHomeworkType === HOMEWORK_TYPES.FILL_BLANK)) {
                    if (hasEssaySignals) {
                        appLogger.info('📝 [自动批改] 标准答案缺失，学生内容更像文档类作答，切换为作文/分析题处理');
                        detectedHomeworkType = HOMEWORK_TYPES.ESSAY;
                    } else {
                        console.warn('⚠️ [自动批改] 未找到标准答案，无法批改选择/填空题，跳过该学生');
                        showNotification(`⏭️ ${student.name} 未找到标准答案，已跳过`, '#FF9800', 2000);
                        continue;
                    }
                }
                
                // ============ 关键优化：预先解析一次答案，避免重复解析 ============
                let preloadedAnswers = null;
                if (isChoiceType(detectedHomeworkType)) {
                    preloadedAnswers = {
                        correct: parseAnswers(standardAnswer),
                        student: parseAnswers(studentAnswer)
                    };
                    appLogger.debug('🔄 [自动批改] 预加载答案对象，避免重复解析');
                }

                const typeConfig = GRADING_CRITERIA_CONFIG[detectedHomeworkType] || null;
                const scoreMethod = typeConfig?.scoreMethod || 'ai_rubric';

                if (isChoiceType(detectedHomeworkType)) {
                    if (!standardAnswer) {
                        console.warn('⚠️ [自动批改] 未找到标准答案，无法批改选择题，跳过该学生');
                        showNotification(`⏭️ ${student.name} 未找到标准答案，已跳过`, '#FF9800', 2000);
                        continue;
                    }
                    score = calculateScoreForChoice(standardAnswer, studentAnswer, 100, preloadedAnswers);
                    // 使用统一入口生成评语，支持分析条件
                    comment = await generateSmartComment(score, standardAnswer, studentAnswer);
                } else if (detectedHomeworkType === HOMEWORK_TYPES.READING_SHORT || scoreMethod === 'keyword_match') {
                    score = calculateReadingShortScore(standardAnswer, studentAnswer, 100, ruleScoreDetails);
                    comment = await generateSmartComment(score, standardAnswer, studentAnswer);
                } else if (detectedHomeworkType === HOMEWORK_TYPES.FILL_BLANK) {
                    score = calculateScoreFillBlank(standardAnswer, studentAnswer, 100, preloadedAnswers);
                    // 使用统一入口生成评语，支持分析条件
                    comment = await generateSmartComment(score, standardAnswer, studentAnswer);
                } else if (detectedHomeworkType === HOMEWORK_TYPES.ESSAY) {
                    score = calculateScoreForEssay(studentAnswer);
                    // 使用统一入口生成评语，支持分析条件
                    comment = await generateSmartComment(score, standardAnswer, studentAnswer);
                } else {
                    // 其余主观题优先走AI细则评分
                    score = calculateScoreForEssay(studentAnswer);
                    comment = await generateSmartComment(score, standardAnswer, studentAnswer);
                }
                
                // 客观题保留本地计算，主观题采用AI返回的新评分
                if (AUTO_GRADING_STATE.currentScore !== null && !isChoiceType(detectedHomeworkType) && detectedHomeworkType !== HOMEWORK_TYPES.READING_SHORT) {
                    appLogger.info(`✨ [自动批改] 作业类型为 ${detectedHomeworkType}，采用AI评分: ${AUTO_GRADING_STATE.currentScore}（本地分数: ${score}）`);
                    score = AUTO_GRADING_STATE.currentScore;
                    AUTO_GRADING_STATE.currentScore = null; // 重置
                } else if (isChoiceType(detectedHomeworkType) || detectedHomeworkType === HOMEWORK_TYPES.READING_SHORT) {
                    appLogger.info(`✅ [自动批改] 客观题保留本地计算分数: ${score}（AI评分已忽略: ${AUTO_GRADING_STATE.currentScore || '无'}）`);
                    AUTO_GRADING_STATE.currentScore = null; // 重置
                }

                score = applyTypeSpecificScoreRules(score, detectedHomeworkType, studentAnswer, ruleScoreDetails);

                if (AUTO_GRADING_STATE.showRuleScoringBreakdown && ruleScoreDetails.length > 0 && detectedHomeworkType !== HOMEWORK_TYPES.VOCAB_CHOICE) {
                    comment = appendRuleScoringBreakdown(comment, ruleScoreDetails);
                }
                
                appLogger.debug(`📝 [自动批改] 最终分数: ${score}，评语: ${comment}`);

                // 记录班级级别分析数据
                if (AUTO_GRADING_STATE.lastAIGradingResult) {
                    recordClassAnalytics(student.name, AUTO_GRADING_STATE.lastAIGradingResult, score, detectedHomeworkType);
                    AUTO_GRADING_STATE.lastAIGradingResult = null;
                }
                
                // 检查暂停 - 准备填充成绩前
                while (AUTO_GRADING_STATE.isPaused) {
                    appLogger.debug('⏸️ [自动批改] 已暂停（准备填充成绩）');
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // 6. 自动填充
                autoFillGradeAndComment(score, comment);
                
                // 7. 保存前关闭可能的弹窗
                await new Promise(resolve => setTimeout(resolve, 500));
                autoCloseIntrruptDialogs();
                
                submitGrade();
                
                // 8. 等待保存完毕
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                appLogger.info(`✅ [自动批改] ${student.name} 批改完成！`);
                
                // 检查暂停 - 准备提交前
                while (AUTO_GRADING_STATE.isPaused) {
                    appLogger.debug('⏸️ [自动批改] 已暂停（准备提交成绩）');
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // 9. 点击"批阅完成"按钮（必须点，这样才能保存成绩）
                appLogger.debug(`🎯 [自动批改] 点击"批阅完成"按钮保存成绩...`);
                await clickCompleteGradingButton();
                appLogger.debug(`✅ [自动批改] 已点击"批阅完成"按钮`);
                
                // 10. 如果还有下一个学生，等待页面自动切换；如果是最后一个，稍后返回
                if (i < filteredList.length - 1) {
                    appLogger.debug(`📄 [自动批改] 等待页面切换到下一位学生（共${filteredList.length - i - 1}位待批`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                
            } catch (error) {
                console.error(`❌ [自动批改] ${student.name} 处理失败:`, error);
            }
        }
        
        // 完成
        closePanelIfExists();
        showNotification('✅ 所有学生已自动批改完成！', '#4CAF50');
        appLogger.info('🎉 [自动批改] 流程完成！');

        // 展示班级共性问题与建议
        showClassSummaryPanel();
        
        // 隐藏暂停按钮
        const pauseControlGroup = document.getElementById('zh-pause-control-group');
        if (pauseControlGroup) {
            pauseControlGroup.style.display = 'none';
        }
        AUTO_GRADING_STATE.isPaused = false;
        
        // 隐藏独立的暂停按钮
        const independentPauseBtn = document.getElementById('zh-pause-float-btn');
        if (independentPauseBtn) {
            independentPauseBtn.classList.remove('show');
            independentPauseBtn.classList.remove('paused');
        }
        
        // 所有学生批改完成后，自动点击返回按钮返回作业详情页面
        appLogger.info('🔙 [自动批改] 所有学生已处理，准备返回作业详情页面...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await clickReturnButton();
        appLogger.info('🏠 [自动批改] 已返回作业详情页面');
    }
    
    // 更新进度条
    function updateProgressBar(current, total, text) {
        const progressEl = document.getElementById('zh-auto-grade-progress');
        const barEl = document.getElementById('zh-auto-grade-bar');
        
        if (progressEl) {
            progressEl.textContent = text;
            progressEl.style.color = AUTO_GRADE_PANEL_STYLE_TEMPLATES.progressColorNormal; // 恢复正常颜色
        }
        if (barEl) {
            const percentage = (current / total) * 100;
            barEl.style.width = percentage + '%';
        }
    }

    async function startAutoGradingFlow() {
        appLogger.info('🖱️ [自动批改] 开始批量自动批改');
        showNotification('🔍 正在扫描所有学生...', '#FF9800');

        // 重置班级统计，避免旧数据污染
        resetClassAnalytics();
        
        // 显示暂停按钮
        AUTO_GRADING_STATE.isPaused = false;
        const pauseControlGroup = document.getElementById('zh-pause-control-group');
        const pauseBtn = document.getElementById('zh-pause-btn');
        if (pauseControlGroup) {
            pauseControlGroup.style.display = 'flex';
        }
        if (pauseBtn) {
            pauseBtn.textContent = '⏸️ 暂停批改';
            pauseBtn.className = 'zh-action-btn type-remind';
        }

        const studentList = await detectStudentList();
        if (studentList.length === 0) {
            showNotification('❌ 未检测到学生列表', '#FF5252');
            console.error('❌ [自动批改] 未检测到学生');
            return;
        }

        const confirmed = confirm(`检测到 ${studentList.length} 个学生，即将开始自动批改，是否继续？\n\n⚠️ 请确保网络连接稳定，批改过程中请勿关闭页面。`);
        if (confirmed) {
            appLogger.info(`✅ [自动批改] 用户已确认，开始处理 ${studentList.length} 个学生`);
            
            // 显示独立的暂停按钮
            const independentPauseBtn = document.getElementById('zh-pause-float-btn');
            if (independentPauseBtn) {
                independentPauseBtn.classList.add('show');
                independentPauseBtn.textContent = '⏸️ 暂停批改';
                independentPauseBtn.classList.remove('paused');
            }
            
            // 扫描完成后，跳转回第一页再开始批改
            await goToPage(1);
            await new Promise(resolve => setTimeout(resolve, 1500)); // 等待页面加载
            executeAutoGradingFlow(studentList);
        } else {
            appLogger.info('❌ [自动批改] 用户取消了自动批改');
        }
    }

    async function startSingleStudentGrading(studentName) {
        appLogger.info(`🖱️ [单人批改] 开始匹配: ${studentName}`);
        showNotification('🔍 正在匹配学生姓名...', '#FF9800');

        // 单人批改前清空统计，聚焦当前学生
        resetClassAnalytics();

        const studentList = await detectStudentList();
        if (studentList.length === 0) {
            showNotification('❌ 未检测到学生列表', '#FF5252');
            return;
        }

        const normalizedTarget = studentName.replace(/\s+/g, '');
        const exactMatches = studentList.filter((student) => {
            const normalizedName = (student.name || '').replace(/\s+/g, '');
            return normalizedName === normalizedTarget;
        });

        let targetList = exactMatches;
        if (targetList.length === 0) {
            targetList = studentList.filter((student) => {
                const normalizedName = (student.name || '').replace(/\s+/g, '');
                return normalizedName.includes(normalizedTarget);
            });
        }

        if (targetList.length === 0) {
            showNotification('❌ 未找到该学生，请检查姓名', '#FF5252');
            return;
        }

        if (targetList.length > 1) {
            const names = targetList.map((s) => s.name).join('、');
            const confirmed = confirm(`匹配到多个学生：${names}\n\n是否只批改第一个：${targetList[0].name}？`);
            if (!confirmed) {
                return;
            }
            targetList = [targetList[0]];
        }

        const confirmed = confirm(`即将批改：${targetList[0].name}\n\n确认开始吗？`);
        if (!confirmed) {
            return;
        }

        appLogger.info(`✅ [单人批改] 开始批改: ${targetList[0].name}`);
        
        // 显示独立的暂停按钮
        const independentPauseBtn = document.getElementById('zh-pause-float-btn');
        if (independentPauseBtn) {
            independentPauseBtn.classList.add('show');
            independentPauseBtn.textContent = '⏸️ 暂停批改';
            independentPauseBtn.classList.remove('paused');
        }
        
        // 扫描完成后，跳转回第一页再开始批改
        await goToPage(1);
        await new Promise(resolve => setTimeout(resolve, 1500)); // 等待页面加载
        
        // 执行批改，完成后自动返回
        await executeAutoGradingFlow(targetList);
        
        // 单人批改完成后提示
        showNotification(`✅ ${targetList[0].name} 已批改完成，已自动返回作业详情页面`, '#4CAF50');
        showClassSummaryPanel();
        appLogger.info(`✅ [单人批改] ${targetList[0].name} 批改完成`);
    }

    async function startOneClickRemind() {
        appLogger.info('🖱️ [一键催交] 开始批量催交');
        showNotification('🔍 正在扫描未交作业的学生...', '#FF9800');

        const unsubmittedList = await detectUnsubmittedStudents();
        if (unsubmittedList.length === 0) {
            showNotification('✅ 太棒了！所有学生都已交作业！', '#4CAF50');
            appLogger.info('✅ [一键催交] 没有未交作业的学生');
            return;
        }

        const confirmed = confirm(`检测到 ${unsubmittedList.length} 位学生未交作业，是否批量催交？\n\n将依次点击每位学生的"催交"按钮`);
        if (confirmed) {
            appLogger.info(`✅ [一键催交] 用户已确认，开始催交 ${unsubmittedList.length} 位学生`);
            // 扫描完成后，跳转回第一页再开始催交
            await goToPage(1);
            await new Promise(resolve => setTimeout(resolve, 1500)); // 等待页面加载
            executeOneClickRemind(unsubmittedList);
        } else {
            appLogger.info('❌ [一键催交] 用户取消了批量催交');
        }
    }
    
    // 打开手动设置评分标准编辑器
    function openManualCriteriaEditor() {
        appLogger.info('✏️ [手动设置] 打开评分标准编辑器...');
        
        // 使用现有状态或空白模板
        const currentState = AUTO_GRADING_STATE.autoGradingConditions;
        const manualTemplate = {
            homeworkType: currentState.isSet ? currentState.homeworkType : '',
            typeExplanation: currentState.isSet ? currentState.typeExplanation : '',
            gradingCriteria: currentState.isSet && currentState.gradingCriteria.length > 0 
                ? currentState.gradingCriteria 
                : ['', '', ''],  // 默认3个空白标准
            gradingAdvice: currentState.isSet ? currentState.gradingAdvice : '',
            commonMistakes: currentState.isSet && currentState.commonMistakes.length > 0
                ? currentState.commonMistakes
                : ['', '']  // 默认2个空白错误
        };
        
        // 显示可编辑面板（手动模式）
        showAnalysisPanel(manualTemplate, true);
        showNotification('✏️ 请设置评分标准', '#2b2b2b');
    }
    
    // 启动作业分析（从悬浮球触发）
    async function startHomeworkAnalysis() {
        appLogger.info('🖱️ [作业分析] 从悬浮球启动分析...');
        
        const currentUrl = window.location.href;
        const isHomeworkDetailsPage = currentUrl.includes('/homeworkDetails') || 
                                     currentUrl.includes('/homework/details') ||
                                     currentUrl.includes('/homework/detail') ||
                                     currentUrl.includes('pre-space-hike/homeworkDetails');
        
        if (!isHomeworkDetailsPage) {
            showNotification('⚠️ 请先进入作业详情页面', '#FF9800');
            appLogger.warn('⚠️ [作业分析] 当前不在作业详情页面，无法分析');
            return;
        }
        
        appLogger.info('✅ [作业分析] 检测到作业详情页面，开始分析...');
        showNotification('⏳ 正在分析作业...', '#FF9800');
        
        try {
            // 提取作业信息
            const homeworkDetails = extractHomeworkDetails();
            
            appLogger.debug('📋 [作业分析] 提取结果检查:');
            appLogger.debug('  - homeworkDetails 存在:', !!homeworkDetails);
            appLogger.debug('  - 标题:', homeworkDetails?.title ? `"${homeworkDetails.title}"` : '❌ 无');
            
            // 检查是否至少有标题（内容可以为空，因为某些页面可能没有文字内容）
            if (!homeworkDetails || !homeworkDetails.title) {
                let msg = '❌ 无法识别作业标题';
                if (homeworkDetails) {
                    msg += `（内容长度：${homeworkDetails.content.length}）`;
                }
                showNotification(msg + '，请检查页面', '#FF5252');
                appLogger.error('❌ [作业分析] ' + msg);
                return;
            }
            
            appLogger.info('📤 [作业分析] 作业信息已提取，调用AI分析...');
            
            // 调用AI分析
            const analysis = await analyzeHomeworkWithAI(homeworkDetails);
            
            // 显示结果
            showAnalysisPanel(analysis);
            showNotification('✅ 分析完成！', '#4CAF50');
            appLogger.info('✅ [作业分析] 分析流程完成');
        } catch (error) {
            appLogger.error('❌ [作业分析] 分析出错:', error);
            const message = error?.message || '分析失败';
            showNotification(`❌ 分析失败: ${message}`, '#FF5252');
            if (message.includes('超时') || message.includes('未收到AI响应')) {
                openManualCriteriaEditor();
            }
        }
    }
    
    // ==========================================
    // 8. 作业详情分析功能（检测和分析作业题目）
    // ==========================================
    
    // 提取作业详情页面的信息
    function extractHomeworkDetails() {
        try {
            appLogger.info('🔍 [作业详情] 开始提取作业信息...');
            
            const details = {
                title: '',
                content: '',
                maxScore: 0,
                deadline: '',
                knowledgePoints: [],
                requirements: '',
                extractTime: new Date().toISOString()
            };
            
            // 1. 提取标题 - 适配不同平台的HTML结构
            const titleSelectors = [
                // Polymas 平台 - 按优先级排列
                '.homework-base-info-header h4',
                '.homework-base-info-header h4 > div',
                'h4[data-v-ec5d307c]',
                'h4 div[data-v-3980a020]',
                // 智慧树平台
                'h1.title',
                'h1',
                '[class*="title"] h1',
                '[class*="homework"] h1',
                '.detail-title',
                'h2'
            ];
            
            appLogger.debug('🔧 [标题提取] 尝试提取标题，共', titleSelectors.length, '个选择器');
            
            for (let i = 0; i < titleSelectors.length; i++) {
                const selector = titleSelectors[i];
                const titleEl = document.querySelector(selector);
                appLogger.debug(`  [${i}] 选择器: "${selector}" -> ${titleEl ? '✅ 找到' : '❌ 未找到'}`);
                
                if (titleEl) {
                    // 尝试多种方式获取文本
                    let title = '';
                    
                    // 方法1: innerText（推荐，只获取可见文本）
                    try {
                        title = titleEl.innerText?.trim() || '';
                    } catch (e) {}
                    
                    // 方法2: textContent（所有文本）
                    if (!title) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    
                    // 方法3: 直接提取直接子节点的文本
                    if (!title) {
                        const childNodes = Array.from(titleEl.childNodes)
                            .filter(node => node.nodeType === Node.TEXT_NODE)
                            .map(node => node.textContent.trim())
                            .filter(text => text.length > 0);
                        title = childNodes.join('');
                    }
                    
                    appLogger.debug(`      原始文本 (长度${title.length}): "${title.substring(0, 60)}..."`);
                    
                    // 多步清理文本
                    title = title
                        .replace(/<!---->/g, '')  // 去除Vue注释
                        .replace(/\s+/g, ' ')     // 合并多个空白为单个空格
                        .replace(/^[\s•●◆◇▪▫─→←↑↓↔●\d.，。、；：]+/, '') // 去除前缀
                        .replace(/[\s•●◆◇▪▫─→←↑↓↔●\d.，。、；：]+$/, '') // 去除后缀
                        .trim();
                    
                    appLogger.debug(`      清理后 (长度${title.length}): "${title}"`);
                    
                    if (title.length > 2 && title.length < 200) {
                        details.title = title;
                        appLogger.info(`✅ [作业详情] 标题提取成功 (${selector}): ${details.title}`);
                        break;
                    } else {
                        appLogger.debug(`      ⚠️ 标题长度不符合: ${title.length} (需要 3-199)`);
                    }
                }
            }
            
            if (!details.title) {
                console.warn('⚠️ [标题提取] 所有标题选择器都失败，尝试从内容中提取');
                // 降级方案：从内容中提取第一行作为标题
                const introEl = document.querySelector('.homework-base-info-intro p');
                if (introEl) {
                    const text = introEl.innerText?.trim() || introEl.textContent?.trim() || '';
                    const firstLine = text.split(/[。！？\n]/)[0].trim();
                    if (firstLine && firstLine.length > 2 && firstLine.length < 200) {
                        details.title = firstLine;
                        appLogger.info('📝 [作业详情] 标题 (降级方案-简介):', details.title);
                    }
                }
            }
            
            if (!details.title) {
                console.error('❌ [标题提取] 降级方案也失败了');
            }
            
            // 2. 提取满分 - 多种格式支持
            const fullText = document.body.textContent;
            let scoreMatches = [
                /满分[：:]\s*(\d+)/,
                /满分(\d+)分/,
                /满分\s*(\d+)\s*分/
            ];
            for (let pattern of scoreMatches) {
                const match = fullText.match(pattern);
                if (match) {
                    details.maxScore = parseInt(match[1]);
                    appLogger.info('⭐ [作业详情] 满分:', details.maxScore);
                    break;
                }
            }
            
            // 3. 提取截止时间
            const deadlineMatches = [
                /截止时间[：:]\s*(.+?)(?=\n|$)/,
                /截止时间\s+(.+?)(?=\n|$)/,
                /截止[\s：:]*(.+?)(?=\n|$)/
            ];
            for (let pattern of deadlineMatches) {
                const match = fullText.match(pattern);
                if (match) {
                    details.deadline = match[1].trim().substring(0, 50);
                    appLogger.info('⏰ [作业详情] 截止时间:', details.deadline);
                    break;
                }
            }
            
            // 4. 提取作业内容 - 按优先级尝试不同选择器
            const contentSelectors = [
                // Polymas 平台
                '.customize-base-info-preview',
                '.customize-base-info-preview p',
                '.requirements-content',
                // 通用选择器
                '.homework-content',
                '[class*="homework-content"]',
                '[class*="content"]',
                '.detail-content',
                '[class*="detail"] [class*="content"]',
                'main',
                '.main-content',
                '[class*="description"]',
                '[class*="desc"]'
            ];
            
            let foundContent = false;
            for (let selector of contentSelectors) {
                const contentEl = document.querySelector(selector);
                if (contentEl) {
                    const text = contentEl.textContent.trim();
                    // 去除过短的文本
                    if (text && text.length > 20 && !text.includes('html') && !text.includes('GET')) {
                        // 限制长度，避免过长的文本
                        details.content = text.substring(0, 2000);
                        appLogger.debug(`📄 [作业详情] 内容 (${selector}): ${details.content.substring(0, 80)}...`);
                        foundContent = true;
                        break;
                    }
                }
            }
            
            if (!foundContent) {
                // 降级方案：查找作业简介
                const introSelectors = [
                    '.homework-base-info-intro p',
                    '.homework-base-info-intro',
                    '[class*="intro"]'
                ];
                for (let selector of introSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text && text.length > 10) {
                            details.content = text;
                            appLogger.debug(`📄 [作业详情] 内容 (降级-简介): ${details.content.substring(0, 80)}...`);
                            foundContent = true;
                            break;
                        }
                    }
                }
            }
            
            if (!foundContent) {
                // 最后降级：使用整个body的文本
                const scripts = document.querySelectorAll('script, style, nav');
                const clonedBody = document.body.cloneNode(true);
                clonedBody.querySelectorAll('script, style, nav').forEach(s => s.remove());
                let bodyText = clonedBody.textContent.trim();
                if (bodyText.length > 100) {
                    details.content = bodyText.substring(0, 2000);
                    appLogger.debug(`📄 [作业详情] 内容 (降级-body): ${details.content.substring(0, 80)}...`);
                    foundContent = true;
                }
            }
            
            appLogger.info(`📊 [作业详情] 内容提取: ${foundContent ? '✅ 成功' : '⚠️ 无内容或提取失败'}, 标题: ${details.title ? '✅ 有' : '❌ 无'}`);
            
            // 5. 提取知识点
            const klgSelectors = [
                '[class*="klg"]',
                '.knowledge-point',
                '[class*="knowledge"]',
                '[class*="tag"]',
                '[class*="label"]'
            ];
            const knowledgePointsSet = new Set();
            for (let selector of klgSelectors) {
                const klgElements = document.querySelectorAll(selector);
                klgElements.forEach(el => {
                    const text = el.textContent.trim();
                    if (text && text.length > 0 && text.length < 50 && !text.includes('http')) {
                        knowledgePointsSet.add(text);
                    }
                });
            }
            details.knowledgePoints = Array.from(knowledgePointsSet).slice(0, 10);
            appLogger.info('🎓 [作业详情] 知识点:', details.knowledgePoints.length > 0 ? details.knowledgePoints : '无');
            
            // 6. 提取其他要求信息
            const otherReqs = [];
            if (fullText.includes('允许迟交')) otherReqs.push('允许迟交');
            if (fullText.includes('禁止迟交')) otherReqs.push('禁止迟交');
            if (fullText.includes('禁止申请重做')) otherReqs.push('禁止申请重做');
            if (fullText.includes('允许学生修改')) {
                const modifyMatch = fullText.match(/允许学生修改(\d+)次/);
                if (modifyMatch) otherReqs.push(`允许学生修改${modifyMatch[1]}次`);
            }
            details.requirements = otherReqs.join('；');
            appLogger.info('📋 [作业详情] 要求:', details.requirements || '无特殊要求');
            
            // 调试信息
            appLogger.debug('🔧 [作业详情] 最终提取结果:');
            appLogger.debug('  ✓ 标题:', details.title ? `"${details.title}"` : '❌ 未提取');
            appLogger.debug('  ✓ 内容:', details.content.length > 0 ? `${details.content.length} 字` : '❌ 无');
            appLogger.debug('  ✓ 满分:', details.maxScore > 0 ? details.maxScore : '❌ 未提取');
            appLogger.debug('  ✓ 知识点:', details.knowledgePoints.length);
            appLogger.debug('  ✓ 要求:', details.requirements || '无');
            
            return details;
        } catch (error) {
            console.error('❌ [作业详情] 提取失败:', error);
            console.debug('❌ [作业详情] 错误堆栈:', error.stack);
            return null;
        }
    }
    
    // 调用API分析作业类型和批改建议
    function pingBackground(timeoutMs = 3000) {
        return new Promise((resolve) => {
            let settled = false;
            const timerId = setTimeout(() => {
                if (settled) return;
                settled = true;
                resolve(false);
            }, timeoutMs);

            chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timerId);

                if (chrome.runtime.lastError) {
                    console.warn('⚠️ [作业分析] 后台Ping失败:', chrome.runtime.lastError.message);
                    resolve(false);
                    return;
                }

                resolve(!!(response && response.success));
            });
        });
    }

    function analyzeHomeworkWithAI(homeworkDetails) {
        const maxAttempts = 2;
        const warnAfterMs = 10000;
        const hardTimeoutMs = 90000;

        const attemptAnalyze = (attempt) => {
            return new Promise((resolve, reject) => {
                appLogger.info(`🤖 [作业分析] 准备调用AI进行分析... (第${attempt}次)`);
                appLogger.debug('📤 [作业分析] 发送数据到background:', homeworkDetails);

                let settled = false;
                const finalize = (handler) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(warnTimeoutId);
                    clearTimeout(hardTimeoutId);
                    handler();
                };

                const warnTimeoutId = setTimeout(() => {
                    console.warn('⏳ [作业分析] 等待AI响应中... (已超过10秒)');
                    showNotification('⏳ AI分析中，请稍候...', '#FF9800');
                }, warnAfterMs);

                const hardTimeoutId = setTimeout(() => {
                    console.error(`⏰ [作业分析] AI响应超时（${hardTimeoutMs / 1000}秒）`);
                    finalize(() => reject(new Error('AI响应超时，请稍后重试')));
                }, hardTimeoutMs);

                chrome.runtime.sendMessage({
                    action: 'analyzeHomeworkDetails',
                    data: homeworkDetails
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        appLogger.error('❌ [作业分析] 通信错误:', chrome.runtime.lastError);
                        finalize(() => reject(new Error(chrome.runtime.lastError.message || '通信失败')));
                    } else if (response && response.success) {
                        appLogger.info('✅ [作业分析] 分析成功');
                        finalize(() => resolve(response.analysis));
                    } else if (!response) {
                        appLogger.error('❌ [作业分析] 未收到AI响应');
                        finalize(() => reject(new Error('未收到AI响应')));
                    } else {
                        appLogger.error('❌ [作业分析] API返回错误:', response);
                        finalize(() => reject(new Error(response?.error || 'AI分析失败')));
                    }
                });
            });
        };

        return pingBackground().then((ok) => {
            if (!ok) {
                throw new Error('后台未响应，请重新加载扩展后重试');
            }
            return attemptAnalyze(1).catch((error) => {
                if (maxAttempts > 1) {
                    console.warn('🔁 [作业分析] 第一次失败，准备重试一次...', error.message);
                    showNotification('🔁 AI分析失败，正在重试...', '#FF9800');
                    return attemptAnalyze(2);
                }
                throw error;
            });
        });
    }

    const MANUAL_EDITOR_STYLES = {
        panel: `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 92%;
            max-width: 920px;
            max-height: 88vh;
            background: #ececec;
            border: 1px solid #d4d4d4;
            border-radius: 24px;
            box-shadow: 0 14px 30px rgba(0, 0, 0, 0.12);
            z-index: 10000;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #242424;
            box-sizing: border-box;
        `,
        header: `
            background: #e3e3e3;
            color: #242424;
            padding: 18px 20px;
            font-weight: 700;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #d1d1d1;
            font-size: 22px;
            letter-spacing: 0.2px;
        `,
        content: `
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 24px 30px;
            background: #ececec;
            box-sizing: border-box;
        `,
        section: 'background:#f0f0f0;border:1px solid #d2d2d2;border-radius:18px; width:100%; max-width:100%; box-sizing:border-box; overflow:hidden;',
        sectionPill: 'display:inline-flex;align-items:center;background:#dfdfdf;border:1px solid #cecece;border-radius:999px;padding:4px 10px;font-size:14px;font-weight:700;'
    };
    
    // 显示作业分析结果面板（可编辑版本）
    function showAnalysisPanel(analysis, isManual = false) {
        appLogger.info('🎨 [作业分析] 创建分析结果面板...', isManual ? '(手动模式)' : '(AI生成)');
        
        // 移除已有的面板
        const existingPanel = document.getElementById('zh-analysis-panel');
        if (existingPanel) existingPanel.remove();
        
        const panel = document.createElement('div');
        panel.id = 'zh-analysis-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', '手动设置评分标准');
        panel.style.cssText = MANUAL_EDITOR_STYLES.panel;

        const header = document.createElement('div');
        header.style.cssText = MANUAL_EDITOR_STYLES.header;
        header.innerHTML = `
            <span>手动设置评分标准</span>
            <button id="zh-panel-close-btn" aria-label="关闭设置面板" style="background: #efefef; border: 1px solid #cecece; color: #333; width: 34px; height: 34px; border-radius: 999px; cursor: pointer; font-size: 18px;">×</button>
        `;

        const closeBtn = header.querySelector('#zh-panel-close-btn');
        closeBtn.addEventListener('click', () => panel.remove());

        const content = document.createElement('div');
        content.style.cssText = MANUAL_EDITOR_STYLES.content;

        const previousCriteriaItems = Array.isArray(analysis.gradingCriteriaItems)
            ? analysis.gradingCriteriaItems
            : (Array.isArray(AUTO_GRADING_STATE.autoGradingConditions.gradingCriteriaItems)
                ? AUTO_GRADING_STATE.autoGradingConditions.gradingCriteriaItems
                : []);

        const defaultCriteriaNames = ['论点清晰度', '论据充分性', '语言逻辑', '创新性'];
        const defaultScores = [30, 30, 20, 20];

        let criteriaItems = [];
        if (previousCriteriaItems.length > 0) {
            criteriaItems = previousCriteriaItems.map((item, idx) => ({
                id: `item-${Date.now()}-${idx}`,
                name: (item?.name || '').trim(),
                score: Number.isFinite(Number(item?.score)) ? Math.min(100, Math.max(0, Math.round(Number(item.score)))) : 0
            }));
        } else if (Array.isArray(analysis.gradingCriteria) && analysis.gradingCriteria.length > 0) {
            criteriaItems = analysis.gradingCriteria.map((text, idx) => {
                const parsed = parseLegacyCriterionText(text);
                return {
                id: `item-${Date.now()}-${idx}`,
                name: parsed.name,
                score: parsed.score > 0 ? parsed.score : Math.min(100, Math.max(0, Math.round(defaultScores[idx] ?? 0)))
                };
            });
        } else {
            criteriaItems = defaultCriteriaNames.map((name, idx) => ({
                id: `item-${Date.now()}-${idx}`,
                name,
                score: Math.min(100, Math.max(0, Math.round(defaultScores[idx] ?? 0)))
            }));
        }

        const initialAdviceRich = analysis.gradingAdviceRich || '';
        const initialAdvicePlain = analysis.gradingAdvice || '';

        content.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:20px; width:100%; max-width:100%; box-sizing:border-box;">
                <section style="background:#f0f0f0;border:1px solid #d2d2d2;border-radius:18px;padding:18px 20px 20px; width:100%; max-width:100%; box-sizing:border-box; overflow:hidden;">
                    <div style="${MANUAL_EDITOR_STYLES.sectionPill}margin-bottom:14px;">作业类型</div>
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <label style="font-size:15px;color:#4b4b4b;">作业类型分类</label>
                        <input id="zh-homework-type" type="text" value="${analysis.homeworkType || ''}" placeholder="例：论述题"
                            style="width:100%;max-width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #cfcfcf;border-radius:12px;font-size:16px;outline:none;background:#f7f7f7;color:#2b2b2b;">
                        <label style="font-size:15px;color:#4b4b4b;">作业类型说明</label>
                        <textarea id="zh-type-explanation" placeholder="可选，例：本题考察..."
                            style="width:100%;max-width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #cfcfcf;border-radius:12px;font-size:16px;min-height:84px;outline:none;resize:vertical;background:#f7f7f7;color:#2b2b2b;">${analysis.typeExplanation || ''}</textarea>
                    </div>
                </section>

                <section style="${MANUAL_EDITOR_STYLES.section}padding:18px 20px 16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="${MANUAL_EDITOR_STYLES.sectionPill}">评分标准</div>
                        <button id="zh-toggle-name-mode" type="button" aria-label="切换评分项名称显示模式" style="background:#f3f3f3;color:#2d2d2d;border:1px solid #cfcfcf;padding:7px 11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">名称显示：自动换行</button>
                    </div>
                    <div id="zh-criteria-list" style="display:flex;flex-direction:column;gap:10px; width:100%; max-width:100%; box-sizing:border-box;"></div>
                    <div style="display:flex;justify-content:flex-end;margin-top:12px;">
                        <button id="zh-add-criterion-btn" aria-label="添加评分项" style="background:#f3f3f3;color:#2d2d2d;border:1px solid #cfcfcf;padding:9px 14px;border-radius:12px;cursor:pointer;font-size:15px;font-weight:600;">+ 添加评分项</button>
                    </div>
                    <div id="zh-score-sum-hint" style="margin-top:10px;font-size:13px;color:#646464;line-height:1.5;">提示：各项分值总和建议为100分</div>
                    <div style="margin-top:6px;font-size:12px;color:#6a6a6a;line-height:1.5;">拖拽手柄可排序；手柄聚焦后可用 ↑/↓ 调整顺序；Ctrl+Enter 保存，Esc 关闭。</div>
                </section>

                <section style="${MANUAL_EDITOR_STYLES.section}padding:18px 20px;">
                    <div style="${MANUAL_EDITOR_STYLES.sectionPill}margin-bottom:12px;">批改建议与注意事项</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                        <button id="zh-rt-bold" type="button" aria-label="加粗选中文本" style="background:#f5f5f5;border:1px solid #cfcfcf;border-radius:10px;padding:7px 11px;cursor:pointer;font-size:14px;">加粗</button>
                        <button id="zh-rt-list" type="button" aria-label="将选中文本转换为列表" style="background:#f5f5f5;border:1px solid #cfcfcf;border-radius:10px;padding:7px 11px;cursor:pointer;font-size:14px;">列表</button>
                        <button id="zh-rt-template" type="button" aria-label="插入评语模板" style="background:#f5f5f5;border:1px solid #cfcfcf;border-radius:10px;padding:7px 11px;cursor:pointer;font-size:14px;">插入评语模板</button>
                    </div>
                    <div id="zh-grading-advice-editor" contenteditable="true" aria-label="批改建议编辑区" tabindex="0"
                        style="min-height:152px;background:#f7f7f7;border:1px solid #cfcfcf;border-radius:12px;padding:14px 14px;font-size:16px;line-height:1.8;outline:none;color:#2b2b2b;white-space:pre-wrap;overflow-wrap:anywhere;">${initialAdviceRich || initialAdvicePlain}</div>
                </section>

                <div style="display:flex;justify-content:space-between;gap:12px;margin-top:8px;">
                    <button id="zh-cancel-analysis-btn" style="min-width:120px;background:#f3f3f3;color:#2d2d2d;border:1px solid #cfcfcf;padding:12px 16px;border-radius:12px;cursor:pointer;font-size:16px;font-weight:600;">取消</button>
                    <button id="zh-save-analysis-btn" style="min-width:140px;background:#2a2a2a;color:#fff;border:1px solid #2a2a2a;padding:12px 18px;border-radius:12px;cursor:pointer;font-size:16px;font-weight:600;">保存设置</button>
                </div>
            </div>
        `;

        panel.appendChild(header);
        panel.appendChild(content);
        document.body.appendChild(panel);

        const criteriaListEl = panel.querySelector('#zh-criteria-list');
        const scoreSumHintEl = panel.querySelector('#zh-score-sum-hint');
        const toggleNameModeBtn = panel.querySelector('#zh-toggle-name-mode');
        const saveAnalysisBtn = panel.querySelector('#zh-save-analysis-btn');
        const closePanel = () => panel.remove();

        let criteriaNameDisplayMode = AUTO_GRADING_STATE.criteriaNameDisplayMode === 'single-line' ? 'single-line' : 'wrap';
        let dragSourceId = null;
        const dropPlaceholder = document.createElement('div');
        dropPlaceholder.style.cssText = 'height:44px;border:1px dashed #8f8f8f;border-radius:10px;background:#ededed;';

        function updateNameModeButtonText() {
            if (!toggleNameModeBtn) return;
            toggleNameModeBtn.textContent = criteriaNameDisplayMode === 'single-line'
                ? '名称显示：单行省略'
                : '名称显示：自动换行';
        }

        function applyNameDisplayMode(nameInput) {
            if (criteriaNameDisplayMode === 'single-line') {
                nameInput.style.whiteSpace = 'nowrap';
                nameInput.style.overflow = 'hidden';
                nameInput.style.textOverflow = 'ellipsis';
                nameInput.style.height = '44px';
                nameInput.style.resize = 'none';
            } else {
                nameInput.style.whiteSpace = 'pre-wrap';
                nameInput.style.overflow = 'hidden';
                nameInput.style.textOverflow = 'clip';
                nameInput.style.resize = 'none';
                nameInput.style.height = 'auto';
            }
        }

        function normalizeScore(value) {
            const parsed = parseInt(String(value), 10);
            if (!Number.isFinite(parsed)) return 0;
            return Math.min(100, Math.max(0, parsed));
        }

        function getScoreSum() {
            return criteriaItems.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
        }

        function isCompactCriteriaLayout() {
            return panel.clientWidth < 760;
        }

        function updateScoreSumHint() {
            const total = getScoreSum();
            scoreSumHintEl.textContent = `提示：各项分值总和建议为100分（当前：${total}分）`;
            scoreSumHintEl.style.color = total === 100 ? '#2f6f3d' : (total > 100 ? '#b42318' : '#8a5a00');
        }

        function renderCriteriaItems() {
            if (dropPlaceholder.parentNode) {
                dropPlaceholder.remove();
            }
            criteriaListEl.innerHTML = '';
            const compactLayout = isCompactCriteriaLayout();
            criteriaItems.forEach((item, index) => {
                const row = document.createElement('div');
                row.className = 'zh-criterion-row';
                row.draggable = true;
                row.dataset.id = item.id;
                row.style.cssText = `
                    display:grid;
                    grid-template-columns: ${compactLayout ? '22px minmax(0, 1fr) 24px' : '22px minmax(0, 1fr) 52px 72px 24px'};
                    align-items:start;
                    gap:${compactLayout ? '8px 10px' : '8px'};
                    background:#f7f7f7;
                    border:1px solid #d0d0d0;
                    border-radius:12px;
                    padding:12px 14px;
                    width:100%;
                    max-width:100%;
                    box-sizing:border-box;
                `;
                row.innerHTML = `
                    <button type="button" class="zh-drag-handle" data-item-id="${item.id}" aria-label="拖拽排序 第${index + 1}项" title="拖拽排序（支持键盘↑/↓）" style="display:flex;align-items:center;justify-content:center;cursor:grab;color:#666;font-size:12px;width:20px;height:20px;border-radius:999px;border:1px solid #cfcfcf;background:#ececec;">⋮⋮</button>
                    <textarea class="zh-criterion-name" aria-label="评分项名称 ${index + 1}" placeholder="评分项 ${index + 1}" title="${(item.name || '').replace(/"/g, '&quot;')}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:10px 12px;border:1px solid #cfcfcf;border-radius:10px;font-size:15px;background:#fff;outline:none;line-height:1.45;resize:none;overflow-wrap:anywhere;${compactLayout ? 'grid-column:2 / 3;' : ''}">${item.name || ''}</textarea>
                    <div class="zh-criterion-score-label" style="display:flex;align-items:center;justify-content:flex-end;gap:6px;color:#444;font-size:12px;white-space:nowrap;">分值</div>
                    <div class="zh-criterion-score-wrap" style="display:flex;flex-direction:column;gap:4px;">
                        <input type="number" class="zh-criterion-score" aria-label="评分项分值 ${index + 1}" min="0" max="100" step="1" value="${normalizeScore(item.score)}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:10px 8px;border:1px solid #cfcfcf;border-radius:10px;font-size:15px;background:#fff;outline:none;">
                        <div class="zh-score-warning" style="display:none;font-size:11px;color:#b42318;line-height:1.3;">已自动限制为 100 分以内</div>
                    </div>
                    <button class="zh-remove-criterion" aria-label="删除评分项 ${index + 1}" title="删除" style="background:none;border:none;cursor:pointer;font-size:16px;color:#666;">🗑️</button>
                `;

                if (compactLayout) {
                    const scoreLabel = row.querySelector('.zh-criterion-score-label');
                    const scoreWrap = row.querySelector('.zh-criterion-score-wrap');
                    const removeBtn = row.querySelector('.zh-remove-criterion');
                    const dragHandle = row.querySelector('.zh-drag-handle');

                    dragHandle.style.gridColumn = '1 / 2';
                    dragHandle.style.gridRow = '1 / 2';

                    removeBtn.style.gridColumn = '3 / 4';
                    removeBtn.style.gridRow = '1 / 2';

                    scoreLabel.style.gridColumn = '1 / 2';
                    scoreLabel.style.gridRow = '2 / 3';
                    scoreLabel.style.justifyContent = 'flex-start';

                    scoreWrap.style.gridColumn = '2 / 4';
                    scoreWrap.style.gridRow = '2 / 3';
                }

                const nameInput = row.querySelector('.zh-criterion-name');
                const scoreInput = row.querySelector('.zh-criterion-score');
                const scoreWarning = row.querySelector('.zh-score-warning');
                const removeBtn = row.querySelector('.zh-remove-criterion');
                const dragHandle = row.querySelector('.zh-drag-handle');

                function autoResizeNameInput() {
                    if (criteriaNameDisplayMode === 'single-line') {
                        return;
                    }
                    nameInput.style.height = 'auto';
                    const nextHeight = Math.max(44, nameInput.scrollHeight);
                    nameInput.style.height = `${nextHeight}px`;
                }

                applyNameDisplayMode(nameInput);
                autoResizeNameInput();

                nameInput.addEventListener('input', () => {
                    item.name = nameInput.value;
                    nameInput.title = item.name;
                    autoResizeNameInput();
                });

                scoreInput.addEventListener('input', () => {
                    const raw = Number(scoreInput.value);
                    const overflow = Number.isFinite(raw) && raw > 100;
                    scoreWarning.style.display = overflow ? 'block' : 'none';
                    scoreInput.style.borderColor = overflow ? '#d92d20' : '#cfcfcf';
                    item.score = normalizeScore(scoreInput.value);
                    updateScoreSumHint();
                });

                scoreInput.addEventListener('blur', () => {
                    const normalized = normalizeScore(scoreInput.value);
                    item.score = normalized;
                    scoreInput.value = String(normalized);
                    scoreWarning.style.display = 'none';
                    scoreInput.style.borderColor = '#cfcfcf';
                    updateScoreSumHint();
                });

                removeBtn.addEventListener('click', () => {
                    criteriaItems = criteriaItems.filter(ci => ci.id !== item.id);
                    renderCriteriaItems();
                });

                row.addEventListener('dragstart', (event) => {
                    dragSourceId = item.id;
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.id);
                    row.style.opacity = '0.55';
                });
                row.addEventListener('dragend', () => {
                    dragSourceId = null;
                    if (dropPlaceholder.parentNode) {
                        dropPlaceholder.remove();
                    }
                    row.style.opacity = '1';
                });
                row.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    if (!dragSourceId || dragSourceId === item.id) return;
                    if (dropPlaceholder.parentNode !== criteriaListEl || dropPlaceholder.nextSibling !== row) {
                        criteriaListEl.insertBefore(dropPlaceholder, row);
                    }
                    row.style.borderColor = '#9d9d9d';
                });
                row.addEventListener('dragleave', () => {
                    row.style.borderColor = '#d0d0d0';
                });
                row.addEventListener('drop', (event) => {
                    event.preventDefault();
                    row.style.borderColor = '#d0d0d0';
                    if (dropPlaceholder.parentNode) {
                        dropPlaceholder.remove();
                    }
                    const dragId = event.dataTransfer.getData('text/plain');
                    if (!dragId || dragId === item.id) return;

                    const fromIndex = criteriaItems.findIndex(ci => ci.id === dragId);
                    const toIndex = criteriaItems.findIndex(ci => ci.id === item.id);
                    if (fromIndex < 0 || toIndex < 0) return;

                    const [moved] = criteriaItems.splice(fromIndex, 1);
                    criteriaItems.splice(toIndex, 0, moved);
                    renderCriteriaItems();
                });

                dragHandle.addEventListener('keydown', (event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();

                    const currentIndex = criteriaItems.findIndex(ci => ci.id === item.id);
                    if (currentIndex < 0) return;

                    const targetIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
                    if (targetIndex < 0 || targetIndex >= criteriaItems.length) return;

                    const [moved] = criteriaItems.splice(currentIndex, 1);
                    criteriaItems.splice(targetIndex, 0, moved);
                    renderCriteriaItems();

                    requestAnimationFrame(() => {
                        const nextHandle = panel.querySelector(`.zh-drag-handle[data-item-id="${item.id}"]`);
                        if (nextHandle) nextHandle.focus();
                    });
                });

                criteriaListEl.appendChild(row);
            });

            updateScoreSumHint();
        }

        renderCriteriaItems();
        updateNameModeButtonText();

        if (toggleNameModeBtn) {
            toggleNameModeBtn.addEventListener('click', () => {
                criteriaNameDisplayMode = criteriaNameDisplayMode === 'single-line' ? 'wrap' : 'single-line';
                persistCriteriaNameDisplayMode(criteriaNameDisplayMode);
                updateNameModeButtonText();
                renderCriteriaItems();
            });
        }

        window.addEventListener('resize', () => {
            if (!document.body.contains(panel)) return;
            renderCriteriaItems();
        });

        panel.querySelector('#zh-add-criterion-btn').addEventListener('click', () => {
            criteriaItems.push({
                id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: '',
                score: 0
            });
            renderCriteriaItems();
        });

        panel.querySelector('#zh-cancel-analysis-btn').addEventListener('click', () => {
            panel.remove();
        });

        const adviceEditor = panel.querySelector('#zh-grading-advice-editor');
        const rtBoldBtn = panel.querySelector('#zh-rt-bold');
        const rtListBtn = panel.querySelector('#zh-rt-list');
        const rtTemplateBtn = panel.querySelector('#zh-rt-template');

        function isSelectionInsideAdviceEditor() {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return false;
            const range = selection.getRangeAt(0);
            const commonNode = range.commonAncestorContainer;
            return adviceEditor.contains(commonNode) || commonNode === adviceEditor;
        }

        function setCaretAfterNode(node) {
            const range = document.createRange();
            range.setStartAfter(node);
            range.collapse(true);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }

        function insertNodeAtCursor(node) {
            adviceEditor.focus();
            const tailNode = node instanceof DocumentFragment ? node.lastChild : node;
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || !isSelectionInsideAdviceEditor()) {
                adviceEditor.appendChild(node);
                if (tailNode) setCaretAfterNode(tailNode);
                return;
            }

            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(node);
            if (tailNode) setCaretAfterNode(tailNode);
        }

        function wrapSelectionWithTag(tagName) {
            adviceEditor.focus();
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || !isSelectionInsideAdviceEditor()) {
                const node = document.createElement(tagName);
                node.textContent = '加粗文本';
                insertNodeAtCursor(node);
                return;
            }

            const range = selection.getRangeAt(0);
            if (range.collapsed) {
                const node = document.createElement(tagName);
                node.textContent = '加粗文本';
                range.insertNode(node);
                setCaretAfterNode(node);
                return;
            }

            const wrapper = document.createElement(tagName);
            wrapper.appendChild(range.extractContents());
            range.insertNode(wrapper);
            setCaretAfterNode(wrapper);
        }

        function insertUnorderedList() {
            adviceEditor.focus();
            const selection = window.getSelection();
            let selectedText = '';
            if (selection && selection.rangeCount > 0 && isSelectionInsideAdviceEditor()) {
                selectedText = selection.toString();
            }

            const lines = (selectedText || '')
                .split(/\n+/)
                .map(line => line.trim())
                .filter(Boolean);
            const finalLines = lines.length > 0 ? lines : ['列表项'];

            const ul = document.createElement('ul');
            ul.style.margin = '0 0 0 18px';
            ul.style.padding = '0';
            finalLines.forEach(line => {
                const li = document.createElement('li');
                li.textContent = line;
                ul.appendChild(li);
            });

            insertNodeAtCursor(ul);
        }

        function insertTemplateText() {
            const template = '【评语模板】\n- 优点：\n- 可改进点：\n- 建议：';
            const frag = document.createDocumentFragment();
            const lines = template.split('\n');
            lines.forEach((line, idx) => {
                if (idx > 0) frag.appendChild(document.createElement('br'));
                frag.appendChild(document.createTextNode(line));
            });
            insertNodeAtCursor(frag);
        }

        [rtBoldBtn, rtListBtn, rtTemplateBtn].forEach(btn => {
            btn.addEventListener('mousedown', (event) => event.preventDefault());
        });

        rtBoldBtn.addEventListener('click', () => wrapSelectionWithTag('strong'));
        rtListBtn.addEventListener('click', () => insertUnorderedList());
        rtTemplateBtn.addEventListener('click', () => insertTemplateText());

        panel.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closePanel();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                if (saveAnalysisBtn) saveAnalysisBtn.click();
            }
        });

        panel.querySelector('#zh-save-analysis-btn').addEventListener('click', () => {
            appLogger.info('💾 [评分标准] 开始保存...');

            const homeworkType = panel.querySelector('#zh-homework-type').value.trim();
            const typeExplanation = panel.querySelector('#zh-type-explanation').value.trim();
            const gradingAdviceRich = adviceEditor.innerHTML.trim();
            const gradingAdvice = adviceEditor.innerText.trim();

            const normalizedCriteriaItems = criteriaItems
                .map(item => ({
                    name: (item.name || '').trim(),
                    score: normalizeScore(item.score)
                }))
                .filter(item => item.name.length > 0);

            if (!homeworkType) {
                showNotification('⚠️ 请填写作业类型', '#FF9800');
                panel.querySelector('#zh-homework-type').focus();
                return;
            }

            if (normalizedCriteriaItems.length === 0) {
                showNotification('⚠️ 请至少添加一条评分标准', '#FF9800');
                return;
            }

            const scoreTotal = normalizedCriteriaItems.reduce((sum, item) => sum + item.score, 0);
            const gradingCriteria = normalizedCriteriaItems.map(item => `${item.name}（${item.score}分）`);

            AUTO_GRADING_STATE.autoGradingConditions = migrateAutoGradingConditions({
                gradingCriteria,
                gradingCriteriaItems: normalizedCriteriaItems,
                gradingAdvice,
                gradingAdviceRich,
                commonMistakes: Array.isArray(analysis.commonMistakes) ? analysis.commonMistakes : [],
                homeworkType,
                typeExplanation,
                isSet: true
            });

            persistManualCriteriaConditions();

            appLogger.info('✅ [评分标准] 保存成功:', AUTO_GRADING_STATE.autoGradingConditions);

            if (scoreTotal !== 100) {
                showNotification(`✅ 已保存（当前总分 ${scoreTotal}）`, '#4CAF50');
            } else {
                showNotification('✅ 评分标准已保存！自动批改时将使用这些标准', '#4CAF50');
            }

            panel.remove();
        });
        
        appLogger.info('✅ [作业分析] 面板已显示，等待用户编辑...');
    }
    
    // ==========================================
    // 9.一键催交功能
    // ==========================================
    
    // 提取所有未交作业的学生（催交状态）
    async function detectUnsubmittedStudents() {
        appLogger.info('🔍 [一键催交] 开始检测未交作业的学生...');
        
        const allUnsubmittedStudents = [];
        
        // 1. 获取总页数
        const totalPages = getTotalPages();
        appLogger.debug(`📄 [一键催交] 总页数: ${totalPages}`);
        
        // 2. 遍历每一页
        for (let page = 1; page <= totalPages; page++) {
            appLogger.debug(`\n📖 [一键催交] 正在扫描第 ${page} 页...`);
            
            // 如果不是第一页，需要点击翻页
            if (page > 1) {
                await goToPage(page);
                await new Promise(resolve => setTimeout(resolve, 1500)); // 等待页面加载
            }
            
            // 提取当前页未交作业的学生
            const studentsOnPage = extractUnsubmittedStudentsFromCurrentPage();
            allUnsubmittedStudents.push(...studentsOnPage);
            
            appLogger.debug(`✅ [一键催交] 第 ${page} 页找到 ${studentsOnPage.length} 个未交作业的学生`);
        }
        
        appLogger.info(`✅ [一键催交] 共检测到 ${allUnsubmittedStudents.length} 个未交作业的学生`);
        return allUnsubmittedStudents;
    }
    
    // 从当前页面提取未交作业的学生
    function extractUnsubmittedStudentsFromCurrentPage() {
        const unsubmittedList = [];
        
        // 尝试多个选择器来找到学生行
        let rows = document.querySelectorAll('tbody tr.el-table__row');
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('table tbody tr');
        }
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('[class*=\"el-table__row\"]');
        }
        
        if (rows.length === 0) {
            return unsubmittedList;
        }
        
        rows.forEach((row, index) => {
            try {
                // 提取学生名字
                let nameCell = row.querySelector('.el-table_1_column_3');
                let studentName = nameCell ? nameCell.textContent.trim() : null;
                
                if (!studentName) {
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 3) {
                        studentName = tds[2].textContent.trim();
                    }
                }
                
                if (!studentName) {
                    return;
                }
                
                // 提取学号
                let idCell = row.querySelector('.el-table_1_column_4');
                let studentId = idCell ? idCell.textContent.trim() : null;
                
                if (!studentId) {
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 4) {
                        studentId = tds[3].textContent.trim();
                    }
                }
                
                // 获取操作列按钮
                let actionBtn = null;
                let actionCell = row.querySelector('.el-table_1_column_9');
                if (actionCell) {
                    actionBtn = actionCell.querySelector('[class*=\"cursor-pointer\"]');
                    if (!actionBtn) {
                        actionBtn = actionCell.querySelector('span');
                    }
                }
                
                if (!actionBtn) {
                    const tds = row.querySelectorAll('td');
                    if (tds.length >= 9) {
                        const lastCell = tds[8];
                        actionBtn = lastCell.querySelector('span');
                        if (!actionBtn) {
                            actionBtn = lastCell.querySelector('div');
                        }
                    }
                }
                
                // 检查是否是"催交"状态
                if (actionBtn) {
                    const actionText = actionBtn.textContent.trim();
                    if (actionText === '催交') {
                        unsubmittedList.push({
                            index: index,
                            name: studentName,
                            id: studentId,
                            element: row,
                            actionBtn: actionBtn
                        });
                        appLogger.debug(`📝 [一键催交] 找到未交作业学生: ${studentName} (${studentId})`);
                    }
                }
            } catch (error) {
                console.error(`❌ [一键催交] 解析学生行 ${index} 失败:`, error);
            }
        });
        
        return unsubmittedList;
    }
    
    // 执行一键催交流程
    async function executeOneClickRemind(studentList) {
        appLogger.info('🚀 [一键催交] 开始催交流程...');
        
        showFloatingPanel('批量催交进行中', '#FF9800', buildRemindProgressPanelHTML());
        
        for (let i = 0; i < studentList.length; i++) {
            const student = studentList[i];
            const progress = `${i + 1}/${studentList.length} - ${student.name}`;
            
            appLogger.info(`\n========== [${i + 1}/${studentList.length}] ${student.name} ==========`);
            updateRemindProgressBar(i + 1, studentList.length, progress);
            
            try {
                // 滚动到元素可见位置
                student.row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 等待滚动完成
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // 点击催交按钮
                appLogger.debug(`📢 [一键催交] 点击 ${student.name} 的催交按钮`);
                student.actionBtn.click();
                
                // 等待催交弹窗出现并自动处理
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // 检查并关闭催交确认弹窗（如果有的话）
                const confirmBtn = document.querySelector('.el-message-box__btns button.el-button--primary');
                if (confirmBtn) {
                    appLogger.debug(`✅ [一键催交] 确认催交 ${student.name}`);
                    confirmBtn.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                appLogger.info(`✅ [一键催交] ${student.name} 催交完成`);
                
            } catch (error) {
                console.error(`❌ [一键催交] ${student.name} 催交失败:`, error);
            }
            
            // 间隔一下，避免过快
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // 完成
        closePanelIfExists();
        showNotification(`✅ 已完成 ${studentList.length} 位学生的催交！`, '#4CAF50');
        appLogger.info('🎉 [一键催交] 流程完成！');
    }
    
    // 更新催交进度条
    function updateRemindProgressBar(current, total, text) {
        const progressEl = document.getElementById('zh-remind-progress');
        const barEl = document.getElementById('zh-remind-bar');
        
        if (progressEl) progressEl.textContent = text;
        if (barEl) {
            const percentage = (current / total) * 100;
            barEl.style.width = percentage + '%';
        }
    }
    
    // 创建独立的暂停按钮
    function createIndependentPauseButton() {
        // 检查按钮是否已存在
        if (document.getElementById('zh-pause-float-btn')) {
            return true;
        }
        
        const pauseBtn = document.createElement('button');
        pauseBtn.id = 'zh-pause-float-btn';
        pauseBtn.className = 'zh-pause-float-btn';
        pauseBtn.textContent = '⏸️ 暂停批改';
        
        pauseBtn.addEventListener('click', () => {
            AUTO_GRADING_STATE.isPaused = !AUTO_GRADING_STATE.isPaused;
            
            if (AUTO_GRADING_STATE.isPaused) {
                pauseBtn.textContent = '▶️ 继续批改';
                pauseBtn.classList.add('paused');
                appLogger.info('⏸️ [暂停控制] 已发出暂停指令，将在安全点暂停');
                showNotification('⏸️ 已暂停（当前步骤完成后生效）', '#FF9800');
            } else {
                pauseBtn.textContent = '⏸️ 暂停批改';
                pauseBtn.classList.remove('paused');
                appLogger.info('▶️ [暂停控制] 继续批改');
                showNotification('▶️ 继续批改', '#4CAF50');
            }
        });
        
        document.body.appendChild(pauseBtn);
        appLogger.debug('✅ [按钮] 独立暂停按钮已创建');
        return true;
    }
    
    // 监听页面动态变化（某些页面可能会动态加载学生列表）
    function setupMutationObserver() {
        appLogger.debug('👁️ [MutationObserver] 开始监听页面变化...');
        
        const observer = new MutationObserver((mutations) => {
            // 每 2 秒检查一次是否需要创建按钮
            // 这样可以处理动态加载的学生列表
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
        
        // 同时设置定期检查
        setInterval(() => {
            const hasBall = document.getElementById('zhihuishu-ai-floating-ball');
            if (!hasBall) {
                appLogger.debug('🔄 [定期检查] 悬浮图标不存在，重新创建...');
                createFloatingBall();
            }
        }, 5000);
    }
    
    // 页面加载完毕后创建自动批改按钮
    function initAutoGradingFeature() {
        try {
            appLogger.info('🚀 [初始化] 开始初始化自动批改功能...');
        
        // 检查是否已初始化
        if (window.AUTO_GRADING_BUTTON_INITIALIZED) {
            appLogger.debug('⚠️ [初始化] 已初始化，跳过重复初始化');
            return;
        }
        
        // 标记已初始化（防止重复）
        window.AUTO_GRADING_BUTTON_INITIALIZED = true;
        
        // 始终创建浮窗球（所有页面都需要）
        createFloatingBall();
        appLogger.info('✅ [初始化] 浮窗球已创建');
        
        // 创建独立的暂停按钮（所有页面都需要）
        createIndependentPauseButton();
        appLogger.debug('✅ [初始化] 独立暂停按钮已创建');
        
        // 检查是否在学生列表页面（只在学生列表页面创建自动批改按钮）
        const currentUrl = window.location.href.toLowerCase();
        const isStudentListPage = currentUrl.includes('/homeworkdetails') ||   // 作业详情页（有学生列表）
                                  currentUrl.includes('/homeworklist') || 
                                  currentUrl.includes('/homework/list') ||
                                  currentUrl.includes('/homework/detail') ||   // Polymas 平台作业详情页
                                  currentUrl.includes('/student') ||
                                  currentUrl.includes('/classstudent') ||
                                  currentUrl.includes('/class');
        
        if (!isStudentListPage) {
            appLogger.debug(`ℹ️ [初始化] 当前在 ${currentUrl.split('/').pop() || '其他'} 页面，跳过按钮创建`);
            return;
        }
        
        appLogger.info('✅ [初始化] 检测到学生列表页面，菜单已就绪');
        appLogger.info('✅ [初始化] 初始化完成');
        
        } catch (error) {
            appLogger.error('❌ [初始化] 初始化过程出错:', error);
            appLogger.debug('❌ [初始化] 错误堆栈:', error.stack);
        }
    }

    // ==========================================
    // 10. 启动
    // ==========================================
    // 只在 DOMContentLoaded 时初始化（避免重复）
    if (document.readyState === 'loading') {
        appLogger.debug('📍 [启动] 页面正在加载，监听 DOMContentLoaded 事件');
        document.addEventListener('DOMContentLoaded', initAutoGradingFeature);
    } else {
        appLogger.debug('📍 [启动] 页面已加载，直接初始化');
        initAutoGradingFeature();
    }

    } catch (error) {
        console.error('❌ [Content Script] 整体执行出错:', error);
        console.debug('❌ [Content Script] 错误堆栈:', error.stack);
    }

})();
