// 智能作业阅卷助手 - 后台脚本

// ==========================================
// DOCX 文本提取器（内联实现）
// ==========================================
/**
 * 从 DOCX 文件的 ArrayBuffer 中提取纯文本
 */
async function extractTextFromDocx(arrayBuffer) {
    try {
        const dataView = new DataView(arrayBuffer);
        
        // 验证 ZIP 文件头（PK\x03\x04）
        if (dataView.getUint32(0, true) !== 0x04034b50) {
            throw new Error('不是有效的 DOCX 文件（ZIP 格式）');
        }
        
        // 查找 word/document.xml 文件
        const documentXml = await findFileInZip(arrayBuffer, 'word/document.xml');
        if (!documentXml) {
            throw new Error('未找到 document.xml');
        }
        
        // 解析 XML 提取文本
        const text = extractTextFromXml(documentXml);
        return text;
        
    } catch (error) {
        console.error('❌ [DOCX解析] 失败:', error.message);
        throw error;
    }
}

async function findFileInZip(zipData, fileName) {
    const dataView = new DataView(zipData);
    const decoder = new TextDecoder('utf-8');
    let offset = 0;
    
    while (offset < zipData.byteLength - 4) {
        const signature = dataView.getUint32(offset, true);
        
        if (signature === 0x04034b50) {
            const filenameLength = dataView.getUint16(offset + 26, true);
            const extraFieldLength = dataView.getUint16(offset + 28, true);
            const compressedSize = dataView.getUint32(offset + 18, true);
            const compressionMethod = dataView.getUint16(offset + 8, true);
            
            const filenameBytes = new Uint8Array(zipData, offset + 30, filenameLength);
            const currentFileName = decoder.decode(filenameBytes);
            
            if (currentFileName === fileName) {
                const dataOffset = offset + 30 + filenameLength + extraFieldLength;
                const compressedData = new Uint8Array(zipData, dataOffset, compressedSize);
                
                if (compressionMethod === 0) {
                    return decoder.decode(compressedData);
                }
                
                if (compressionMethod === 8) {
                    try {
                        const stream = new Blob([compressedData]).stream();
                        const decompressedStream = stream.pipeThrough(
                            new DecompressionStream('deflate-raw')
                        );
                        const decompressedBlob = await new Response(decompressedStream).blob();
                        const decompressedText = await decompressedBlob.text();
                        return decompressedText;
                    } catch (e) {
                        console.warn('⚠️ [解压] 浏览器解压失败:', e.message);
                        return decoder.decode(compressedData);
                    }
                }
            }
            
            offset += 30 + filenameLength + extraFieldLength + compressedSize;
        } else {
            offset++;
        }
    }
    
    return null;
}

function extractTextFromXml(xml) {
    const textRegex = /<w:t[^>]*>(.*?)<\/w:t>/gs;
    const paragraphs = xml.split(/<w:p[\s>]/);
    const result = [];
    
    for (const para of paragraphs) {
        const paraTexts = [];
        let match;
        while ((match = textRegex.exec(para)) !== null) {
            const text = match[1]
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'");
            paraTexts.push(text);
        }
        if (paraTexts.length > 0) {
            result.push(paraTexts.join(''));
        }
    }
    
    return result.join('\n').trim();
}

// ==========================================
// 全局API配置（集中管理，避免重复定义）
// ==========================================
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const STORAGE_KEYS = {
    apiKey: 'zhai_api_key',
    logLevel: 'zhai_log_level',
    runtimeMetrics: 'zhai_runtime_metrics'
};

const LOG_LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 99
};

const NETWORK_ATTACHMENT_TRACKER = {
    maxItems: 300,
    ttlMs: 5 * 60 * 1000,
    byTab: new Map()
};

function isTrackedAttachmentUrl(url) {
    const lower = String(url || '').toLowerCase();
    if (!lower.startsWith('http')) return false;
    if (lower.includes('image.zhihuishu.com')) return false;
    if (lower.includes('google.cn') || lower.includes('baidu.com')) return false;

    return lower.includes('file.zhihuishu.com') ||
        lower.includes('aliyuncs.com') ||
        lower.includes('/resource/preview') ||
        lower.includes('/resource/onlinepreview') ||
        lower.includes('/resource/getcorsfile') ||
        lower.includes('download') ||
        lower.includes('attachment');
}

function cleanupTrackedUrls(tabId) {
    const records = NETWORK_ATTACHMENT_TRACKER.byTab.get(tabId);
    if (!records || !records.length) return;
    const now = Date.now();
    const alive = records.filter((item) => (now - Number(item.timestamp || 0)) <= NETWORK_ATTACHMENT_TRACKER.ttlMs);
    if (alive.length) {
        NETWORK_ATTACHMENT_TRACKER.byTab.set(tabId, alive.slice(-NETWORK_ATTACHMENT_TRACKER.maxItems));
    } else {
        NETWORK_ATTACHMENT_TRACKER.byTab.delete(tabId);
    }
}

function trackAttachmentUrl(tabId, url, source = 'webRequest') {
    if (!Number.isInteger(tabId) || tabId < 0) return;
    if (!isTrackedAttachmentUrl(url)) return;

    cleanupTrackedUrls(tabId);
    const current = NETWORK_ATTACHMENT_TRACKER.byTab.get(tabId) || [];
    const timestamp = Date.now();

    const exists = current.some((item) => item && item.url === url);
    if (exists) return;

    current.push({ url, source, timestamp });
    NETWORK_ATTACHMENT_TRACKER.byTab.set(tabId, current.slice(-NETWORK_ATTACHMENT_TRACKER.maxItems));
}

function getTrackedAttachmentUrlsForTab(tabId, sinceTs = 0, consume = false) {
    cleanupTrackedUrls(tabId);
    const records = NETWORK_ATTACHMENT_TRACKER.byTab.get(tabId) || [];
    const minTs = Number(sinceTs || 0);
    const filtered = records.filter((item) => Number(item.timestamp || 0) >= minTs);
    const urls = Array.from(new Set(filtered.map((item) => item.url).filter(Boolean)));

    if (consume && Number.isInteger(tabId) && tabId >= 0) {
        NETWORK_ATTACHMENT_TRACKER.byTab.delete(tabId);
    }

    return {
        count: urls.length,
        urls,
        records: filtered
    };
}

if (chrome?.webRequest?.onCompleted) {
    chrome.webRequest.onCompleted.addListener(
        (details) => {
            try {
                trackAttachmentUrl(details?.tabId, details?.url, 'webRequest.onCompleted');
            } catch (error) {
                console.warn('⚠️ [Background] 记录网络附件URL失败:', error.message);
            }
        },
        { urls: ['<all_urls>'] }
    );
}

let currentLogLevel = 'info';
const nativeConsole = {
    debug: console.debug.bind(console),
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
};

function normalizeLogLevel(level) {
    const normalized = String(level || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(LOG_LEVELS, normalized) ? normalized : 'info';
}

function shouldOutput(level) {
    return (LOG_LEVELS[level] ?? LOG_LEVELS.info) >= (LOG_LEVELS[currentLogLevel] ?? LOG_LEVELS.info);
}

function applyConsoleLogLevel(level) {
    currentLogLevel = normalizeLogLevel(level);

    console.debug = (...args) => {
        if (shouldOutput('debug')) nativeConsole.debug(...args);
    };
    console.log = (...args) => {
        if (shouldOutput('info')) nativeConsole.log(...args);
    };
    console.info = (...args) => {
        if (shouldOutput('info')) nativeConsole.info(...args);
    };
    console.warn = (...args) => {
        if (shouldOutput('warn')) nativeConsole.warn(...args);
    };
    console.error = (...args) => {
        if (shouldOutput('error')) nativeConsole.error(...args);
    };
}

async function loadAndApplyLogLevel() {
    try {
        const data = await chrome.storage.local.get([STORAGE_KEYS.logLevel]);
        applyConsoleLogLevel(data?.[STORAGE_KEYS.logLevel] || 'info');
    } catch (error) {
        applyConsoleLogLevel('info');
        nativeConsole.warn('⚠️ [Background] 读取日志级别失败，使用默认 info');
    }
}

async function setAndPersistLogLevel(level) {
    const finalLevel = normalizeLogLevel(level);
    await chrome.storage.local.set({ [STORAGE_KEYS.logLevel]: finalLevel });
    applyConsoleLogLevel(finalLevel);
    return finalLevel;
}

async function recordRuntimeMetric(eventName, status = 'success', detail = '') {
    try {
        const key = STORAGE_KEYS.runtimeMetrics;
        const stored = await chrome.storage.local.get([key]);
        const metrics = stored?.[key] && typeof stored[key] === 'object' ? stored[key] : {
            updatedAt: 0,
            totalSuccess: 0,
            totalFail: 0,
            events: {}
        };

        const eventKey = String(eventName || 'unknown');
        if (!metrics.events[eventKey]) {
            metrics.events[eventKey] = { success: 0, fail: 0, lastStatus: '', lastDetail: '', lastAt: 0 };
        }

        const isFail = status === 'fail';
        metrics.events[eventKey][isFail ? 'fail' : 'success'] += 1;
        metrics.events[eventKey].lastStatus = status;
        metrics.events[eventKey].lastDetail = String(detail || '').slice(0, 180);
        metrics.events[eventKey].lastAt = Date.now();
        metrics.updatedAt = Date.now();
        if (isFail) {
            metrics.totalFail += 1;
        } else {
            metrics.totalSuccess += 1;
        }

        await chrome.storage.local.set({ [key]: metrics });
    } catch (error) {
        nativeConsole.warn('⚠️ [Background] 写入运行指标失败:', error.message);
    }
}

async function getRuntimeDiagnostics() {
    const data = await chrome.storage.local.get([STORAGE_KEYS.logLevel, STORAGE_KEYS.runtimeMetrics]);
    const metrics = data?.[STORAGE_KEYS.runtimeMetrics] || { totalSuccess: 0, totalFail: 0, events: {}, updatedAt: 0 };
    const topFailures = Object.entries(metrics.events || {})
        .map(([name, item]) => ({ name, fail: item.fail || 0 }))
        .sort((a, b) => b.fail - a.fail)
        .slice(0, 3)
        .filter(item => item.fail > 0);

    return {
        logLevel: normalizeLogLevel(data?.[STORAGE_KEYS.logLevel] || 'info'),
        metrics,
        summary: {
            totalSuccess: metrics.totalSuccess || 0,
            totalFail: metrics.totalFail || 0,
            updatedAt: metrics.updatedAt || 0,
            topFailures
        }
    };
}

async function clearRuntimeMetrics() {
    const cleared = { updatedAt: Date.now(), totalSuccess: 0, totalFail: 0, events: {} };
    await chrome.storage.local.set({ [STORAGE_KEYS.runtimeMetrics]: cleared });
    return cleared;
}

loadAndApplyLogLevel();

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!changes[STORAGE_KEYS.logLevel]) return;
    applyConsoleLogLevel(changes[STORAGE_KEYS.logLevel].newValue || 'info');
});

function maskApiKeyForDisplay(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        return '';
    }

    if (apiKey.length <= 8) {
        return `${apiKey.slice(0, 2)}****${apiKey.slice(-2)}`;
    }

    const start = apiKey.slice(0, 6);
    const end = apiKey.slice(-4);
    const maskLength = Math.max(4, apiKey.length - 10);
    return `${start}${'*'.repeat(maskLength)}${end}`;
}

async function getStoredApiKey() {
    const result = await chrome.storage.local.get([STORAGE_KEYS.apiKey]);
    const apiKey = result?.[STORAGE_KEYS.apiKey];
    return typeof apiKey === 'string' ? apiKey.trim() : '';
}

async function getApiKeyOrThrow() {
    const apiKey = await getStoredApiKey();
    if (!apiKey) {
        throw new Error('未配置 API Key，请先在插件设置页填写并保存');
    }
    return apiKey;
}

// 通用超时fetch工具函数
function fetchWithTimeout(url, options, timeout = 30000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`请求超时（${timeout / 1000}秒）`)), timeout)
        )
    ]);
}

console.log('🚀 [Background] Service Worker 启动中...');

// 全局错误处理器
self.addEventListener('error', (event) => {
    console.error('❌ [Background] 全局错误:', event.error);
    console.error('❌ [Background] 错误消息:', event.message);
    console.error('❌ [Background] 错误位置:', event.filename, 'Line:', event.lineno);
    recordRuntimeMetric('global_error', 'fail', event?.message || event?.error?.message || 'unknown error');
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('❌ [Background] 未处理的Promise拒绝:', event.reason);
    recordRuntimeMetric('unhandled_rejection', 'fail', event?.reason?.message || String(event?.reason || 'unknown rejection'));
});

// 自检功能
function performSelfCheck() {
    console.log('🔍 [Background] 开始自检...');
    
    const checks = {
        chrome: typeof chrome !== 'undefined',
        runtime: typeof chrome?.runtime !== 'undefined',
        tabs: typeof chrome?.tabs !== 'undefined',
        sidePanel: typeof chrome?.sidePanel !== 'undefined',
        fetch: typeof fetch !== 'undefined'
    };
    
    console.log('📋 [Background] 自检结果:', checks);
    
    const allPassed = Object.values(checks).every(v => v === true);
    if (allPassed) {
        console.log('✅ [Background] 所有自检项通过');
    } else {
        console.error('❌ [Background] 部分自检项失败');
    }
    
    return allPassed;
}

// 执行自检
const selfCheckPassed = performSelfCheck();
if (!selfCheckPassed) {
    console.error('❌ [Background] 自检失败，Service Worker可能无法正常工作');
}

// Service Worker启动时立即执行
chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 [Background] Service Worker 重新启动');
});

// 处理插件图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
    console.log('🖱️ [Background] 扩展图标被点击');
    try {
        if (chrome.sidePanel) {
            await chrome.sidePanel.open({ windowId: tab.windowId });
            console.log('✅ [Background] 侧边栏已打开');
        }
    } catch (error) {
        console.error('❌ [Background] 打开侧边栏失败:', error);
    }
});

console.log('✅ [Background] Service Worker 已完成初始化');
console.log('👂 [Background] 正在监听消息...');

// 简单的加载状态辅助（后台日志版）
function showLoadingState(label = '任务') {
    const startTime = Date.now();
    return {
        show: () => {
            console.log(`⏳ [${label}] 开始执行...`);
        },
        update: (progress, note = '') => {
            const suffix = note ? ` - ${note}` : '';
            console.log(`🔄 [${label}] 进度: ${progress}%${suffix}`);
        },
        hide: () => {
            const elapsed = Date.now() - startTime;
            console.log(`✅ [${label}] 完成，用时 ${elapsed}ms`);
        }
    };
}

// ==========================================
// 消息处理中心
// ==========================================
console.log('🔧 [Background] 正在注册消息监听器...');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 [Background] 收到消息:', request.action, '来自标签页:', sender.tab?.id);
    console.log('📨 [Background] 完整请求数据:', JSON.stringify(request).substring(0, 200));
    const actionName = request?.action || 'unknown';
    
    // 立即标记我们会异步响应
    const willRespondAsync = true;
    
    // 处理消息
    (async () => {
        try {
            let result;
            
            switch (request.action) {
                case 'ping':
                    console.log('🏓 [Background] Ping请求');
                    console.log('🏓 [Background] Service Worker 活跃中，准备响应 pong');
                    result = { success: true, message: 'pong', timestamp: Date.now() };
                    console.log('🏓 [Background] Ping响应已准备:', result);
                    break;

                case 'getTrackedAttachmentUrls': {
                    const senderTabId = sender?.tab?.id;
                    const tabId = Number.isInteger(request?.tabId) ? request.tabId : senderTabId;
                    if (!Number.isInteger(tabId)) {
                        result = { success: false, error: '无法确定当前标签页ID' };
                        break;
                    }

                    const tracked = getTrackedAttachmentUrlsForTab(
                        tabId,
                        request?.sinceTs || 0,
                        !!request?.consume
                    );

                    result = {
                        success: true,
                        tabId,
                        count: tracked.count,
                        urls: tracked.urls,
                        records: tracked.records
                    };
                    break;
                }
                    
                case 'captureScreen':
                    console.log('📸 [Background] 截屏请求');
                    try {
                        const captureResult = await captureScreenSimple();
                        // 处理新的返回格式：{dataUrl, isFullScreen}
                        const imageData = captureResult.dataUrl || captureResult;
                        console.log('✅ [Background] 截屏成功，全屏模式:', captureResult.isFullScreen || false);
                        result = { success: true, data: imageData, isFullScreen: captureResult.isFullScreen || false };
                    } catch (error) {
                        console.error('❌ [Background] 截屏失败:', error);
                        result = { success: false, error: error.message || '截屏失败' };
                    }
                    break;
                
                case 'triggerIframeFullscreen':
                    console.log('🧩 [Background] 尝试在所有 iframe 中进入全屏');
                    try {
                        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (!tabs.length) {
                            throw new Error('未找到活动标签页');
                        }
                        const tabId = tabs[0].id;
                        const execResults = await chrome.scripting.executeScript({
                            target: { tabId, allFrames: true },
                            func: () => {
                                const selectors = [
                                    '[onclick*="fullScreen"]',
                                    '.full-btn1',
                                    '[title*="全屏"]',
                                    '[aria-label*="全屏"]',
                                    'a.full-btn1',
                                    'button[title*="全屏"]'
                                ];
                                for (const selector of selectors) {
                                    const btn = document.querySelector(selector);
                                    if (btn && btn.offsetParent !== null) {
                                        btn.click();
                                        return { success: true, selector };
                                    }
                                }
                                const els = Array.from(document.querySelectorAll('*'));
                                for (const el of els) {
                                    if (el.textContent && el.textContent.trim() === '全屏' && el.offsetParent !== null) {
                                        const clickable = el.closest('a, button, [role="button"]');
                                        if (clickable) {
                                            clickable.click();
                                            return { success: true, selector: 'text:全屏' };
                                        }
                                    }
                                }
                                return { success: false };
                            }
                        });
                        const success = (execResults || []).some((r) => r.result && r.result.success);
                        result = { success };
                    } catch (error) {
                        console.error('❌ [Background] iframe 全屏触发失败:', error);
                        result = { success: false, error: error.message || 'iframe 全屏触发失败' };
                    }
                    break;
                    
                case 'extractIframeText':
                    console.log('🧩 [Background] iframe 文本提取请求');
                    try {
                        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (!tabs.length) {
                            throw new Error('未找到活动标签页');
                        }
                        const tabId = tabs[0].id;
                        const execResults = await chrome.scripting.executeScript({
                            target: { tabId, allFrames: true },
                            func: () => {
                                const textLayerEls = document.querySelectorAll('.textLayer, [class*="textLayer"]');
                                let textLayerText = '';
                                textLayerEls.forEach((el) => {
                                    textLayerText += (el.innerText || el.textContent || '') + '\n';
                                });
                                const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
                                const text = textLayerText.trim().length > 50 ? textLayerText : bodyText;
                                return {
                                    text,
                                    textLayerText,
                                    bodyText,
                                    url: location.href,
                                    title: document.title,
                                    length: text.length
                                };
                            }
                        });
                        
                        const badMarkers = [
                            'outlineback to top', '导出', '主题', '快捷键', '帮助中心',
                            'clip', 'rss', 'podcast', 'premium', '账户', '设置', '语言'
                        ];
                        const scoreText = (text) => {
                            const normalized = (text || '').replace(/\s+/g, ' ').trim();
                            if (normalized.length < 200) return -1;
                            const lowered = normalized.toLowerCase();
                            const badHits = badMarkers.filter((m) => lowered.includes(m)).length;
                            const chineseCount = (normalized.match(/[\u4e00-\u9fff]/g) || []).length;
                            return normalized.length + chineseCount * 2 - badHits * 400;
                        };
                        
                        const candidates = (execResults || [])
                            .map((r) => r.result)
                            .filter((r) => r && typeof r.text === 'string');
                        
                        let best = null;
                        let bestScore = -1;
                        for (const c of candidates) {
                            const s = scoreText(c.text);
                            if (s > bestScore) {
                                bestScore = s;
                                best = c;
                            }
                        }
                        
                        if (best && bestScore > 0) {
                            console.log('✅ [Background] iframe 文本提取成功:', best.url);
                            result = { success: true, text: best.text, url: best.url, length: best.length };
                        } else {
                            console.warn('⚠️ [Background] 未找到可用的 iframe 文本');
                            result = { success: false, error: '未从 iframe 提取到正文内容' };
                        }
                    } catch (error) {
                        console.error('❌ [Background] iframe 文本提取失败:', error);
                        result = { success: false, error: error.message || 'iframe 文本提取失败' };
                    }
                    break;
                    
                case 'analyzeHomework':
                    console.log('🖼️ [Background] 图片分析请求');
                    try {
                        const response = await analyzeHomeworkWithAI(request.imageData);
                        result = { success: true, data: response };
                    } catch (error) {
                        console.error('❌ [Background] 图片分析失败:', error);
                        result = { success: false, error: error.message || '分析失败' };
                    }
                    break;

                case 'getApiKeyConfig':
                    try {
                        const apiKey = await getStoredApiKey();
                        result = {
                            success: true,
                            hasApiKey: !!apiKey,
                            maskedApiKey: apiKey ? maskApiKeyForDisplay(apiKey) : ''
                        };
                    } catch (error) {
                        console.error('❌ [Background] 读取 API Key 配置失败:', error);
                        result = { success: false, error: error.message || '读取 API Key 配置失败' };
                    }
                    break;

                case 'setApiKeyConfig':
                    try {
                        const apiKey = (request.apiKey || '').trim();
                        if (!apiKey) {
                            throw new Error('API Key 不能为空');
                        }
                        await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: apiKey });
                        result = {
                            success: true,
                            hasApiKey: true,
                            maskedApiKey: maskApiKeyForDisplay(apiKey)
                        };
                    } catch (error) {
                        console.error('❌ [Background] 保存 API Key 配置失败:', error);
                        result = { success: false, error: error.message || '保存 API Key 配置失败' };
                    }
                    break;

                case 'getRuntimeDiagnostics':
                    try {
                        const diagnostics = await getRuntimeDiagnostics();
                        result = { success: true, diagnostics };
                    } catch (error) {
                        result = { success: false, error: error.message || '读取运行诊断失败' };
                    }
                    break;

                case 'setRuntimeLogLevel':
                    try {
                        const savedLevel = await setAndPersistLogLevel(request.level);
                        result = { success: true, level: savedLevel };
                    } catch (error) {
                        result = { success: false, error: error.message || '设置日志级别失败' };
                    }
                    break;

                case 'clearRuntimeMetrics':
                    try {
                        const metrics = await clearRuntimeMetrics();
                        result = { success: true, metrics };
                    } catch (error) {
                        result = { success: false, error: error.message || '清空运行指标失败' };
                    }
                    break;
                    
                case 'analyzeHomeworkText':
                    console.log('📝 [Background] 文本分析请求');
                    console.log('📊 [Background] 数据长度:', JSON.stringify(request.homeworkData).length);
                    try {
                        const response = await analyzeHomeworkTextDirect(request.homeworkData);
                        console.log('✅ [Background] 文本分析成功');
                        result = { success: true, data: response };
                    } catch (error) {
                        console.error('❌ [Background] 文本分析失败:', error.message);
                        result = { success: false, error: error.message || '文本分析失败' };
                    }
                    break;
                    
                case 'analyzeHomeworkDetails':
                    console.log('📚 [Background] 作业详情分析请求');
                    console.log('📊 [Background] 详情数据:', request.data);
                    try {
                        const analysis = await analyzeHomeworkDetailsWithAI(request.data);
                        console.log('✅ [Background] 作业详情分析成功');
                        result = { success: true, analysis: analysis };
                    } catch (error) {
                        console.error('❌ [Background] 作业详情分析失败:', error.message);
                        result = { success: false, error: error.message || '作业详情分析失败' };
                    }
                    break;
                    
                case 'gradeStudentHomework':
                    console.log('📝 [Background] 学生作业批改请求');
                    console.log('📊 [Background] 批改数据:', request.data);
                    try {
                        const grading = await gradeStudentHomeworkWithAI(request.data);
                        console.log('✅ [Background] 作业批改成功');
                        result = { success: true, grading: grading };
                    } catch (error) {
                        console.error('❌ [Background] 作业批改失败:', error.message);
                        result = { success: false, error: error.message || '作业批改失败' };
                    }
                    break;
                    
                case 'performOCR':
                    console.log('🔍 [Background] OCR 识别请求');
                    try {
                        const text = await performOCR(request.imageData);
                        console.log('✅ [Background] OCR 识别成功');
                        result = { success: true, text: text };
                    } catch (error) {
                        console.error('❌ [Background] OCR 识别失败:', error.message);
                        result = { success: false, error: error.message || 'OCR 识别失败' };
                    }
                    break;

                case 'downloadAndParseAttachment':
                    console.log('📎 [Background] 单附件下载解析请求');
                    try {
                        const fileUrl = String(request.fileUrl || '').trim();
                        const fileName = String(request.fileName || '').trim() || 'unknown';

                        if (!fileUrl) {
                            throw new Error('fileUrl 为空');
                        }

                        const response = await fetch(fileUrl);
                        if (!response.ok) {
                            throw new Error(`下载失败: HTTP ${response.status}`);
                        }

                        const lowerName = fileName.toLowerCase();
                        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
                        let content = '';

                        // 优先按文件后缀判断，避免某些站点 content-type 不准确。
                        if (lowerName.endsWith('.docx') || contentType.includes('officedocument.wordprocessingml')) {
                            const arrayBuffer = await response.arrayBuffer();
                            try {
                                content = await extractTextFromDocx(arrayBuffer);
                            } catch (docxError) {
                                console.warn('⚠️ [Background] DOCX解析失败，回退到文本读取:', docxError.message);
                                content = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer));
                            }
                        } else {
                            content = await response.text();
                        }

                        result = {
                            success: true,
                            fileUrl,
                            fileName,
                            content: String(content || '')
                        };
                    } catch (error) {
                        console.error('❌ [Background] 单附件解析失败:', error.message);
                        result = {
                            success: false,
                            error: error.message || '下载解析失败'
                        };
                    }
                    break;
                    
                case 'downloadAttachments':
                    console.log('📎 [Background] 附件下载请求');
                    console.log('📊 [Background] 附件数量:', request.urls?.length || 0);
                    try {
                        const urls = request.urls || [];
                        const results = [];
                        
                        for (const urlObj of urls) {
                            console.log(`⬇️ [附件下载] 开始下载: ${urlObj.name}`);
                            console.log(`   URL: ${urlObj.url}`);
                            
                            try {
                                const response = await fetch(urlObj.url);
                                if (!response.ok) {
                                    console.error(`❌ [附件下载] HTTP错误: ${response.status}`);
                                    results.push({
                                        fileName: urlObj.name,
                                        content: `下载失败：HTTP ${response.status}`,
                                        success: false
                                    });
                                    continue;
                                }
                                
                                // 判断文件类型并使用相应的解析方法
                                let content = '';
                                const fileName = urlObj.name.toLowerCase();
                                
                                if (fileName.endsWith('.docx')) {
                                    console.log(`📄 [DOCX解析] 开始解析: ${urlObj.name}`);
                                    try {
                                        const arrayBuffer = await response.arrayBuffer();
                                        content = await extractTextFromDocx(arrayBuffer);
                                        console.log(`✅ [DOCX解析] 成功提取文本，长度: ${content.length} 字符`);
                                        console.log(`   内容预览: ${content.substring(0, 300)}...`);
                                    } catch (docxError) {
                                        console.error(`❌ [DOCX解析] 失败，回退到text():`, docxError.message);
                                        // 回退：使用 text() 方法（会产生乱码，但总比失败好）
                                        const textResponse = await fetch(urlObj.url);
                                        content = await textResponse.text();
                                        console.log(`⚠️ [DOCX解析] 使用text()回退，内容可能乱码`);
                                    }
                                } else {
                                    // 非 DOCX 文件，直接读取文本
                                    content = await response.text();
                                    console.log(`✅ [附件下载] 文本文件，大小: ${content.length} 字符`);
                                }
                                
                                results.push({
                                    fileName: urlObj.name,
                                    content: content,
                                    success: true
                                });
                            } catch (error) {
                                console.error(`❌ [附件下载] 失败:`, error.message);
                                results.push({
                                    fileName: urlObj.name,
                                    content: `下载失败：${error.message}`,
                                    success: false
                                });
                            }
                        }
                        
                        console.log(`✅ [Background] 附件处理完成: 成功${results.filter(r => r.success).length}个，失败${results.filter(r => !r.success).length}个`);
                        result = { success: true, attachments: results };
                    } catch (error) {
                        console.error('❌ [Background] 附件处理失败:', error.message);
                        result = { success: false, error: error.message || '附件处理失败' };
                    }
                    break;
                    
                default:
                    console.warn('⚠️ [Background] 未知操作:', request.action);
                    result = { success: false, error: '未知操作: ' + request.action };
            }

            if (result?.success) {
                recordRuntimeMetric(`action:${actionName}`, 'success');
            } else {
                recordRuntimeMetric(`action:${actionName}`, 'fail', result?.error || 'unknown error');
            }
            
            console.log('📤 [Background] 发送响应:', result.success ? '✅成功' : '❌失败');
            sendResponse(result);
            
        } catch (error) {
            console.error('❌ [Background] 消息处理异常:', error);
            recordRuntimeMetric(`action:${actionName}`, 'fail', error?.message || 'message handling exception');
            sendResponse({ success: false, error: error.message || '消息处理失败' });
        }
    })();
    
    // 返回true保持消息通道打开
    return willRespondAsync;
});

console.log('✅ [Background] 消息监听器已注册');
console.log('✅ [Background] Service Worker 初始化完成，等待消息...');
console.log('✅ [Background] 当前时间:', new Date().toISOString());

// ==========================================
// 文本作业AI阅卷（直接从DOM提取）
// ==========================================
async function analyzeHomeworkTextDirect(homeworkData) {
    console.log('🎯 [Step 1/5] 开始文本作业阅卷流程...');
    console.log('📝 [Step 1/5] 作业数据:', homeworkData);
    
    try {
        // 构建完整的作业文本
        console.log('📝 [Step 2/5] 构建作业文本...');
        let homeworkText = '';
        
        if (homeworkData.question) {
            homeworkText += `【作业题目】\n${homeworkData.question}\n\n`;
        }
        
        if (homeworkData.answer) {
            homeworkText += `【学生答案】\n${homeworkData.answer}`;
        } else if (homeworkData.fullText) {
            homeworkText = homeworkData.fullText;
        }
        
        if (!homeworkText || homeworkText.trim().length === 0) {
            throw new Error('未能提取到有效的作业内容');
        }
        
        console.log('✅ [Step 2/5] 作业文本准备完成');
        console.log('📊 [Step 2/5] 文本长度:', homeworkText.length);
        console.log('📄 [Step 2/5] 文本预览:', homeworkText.substring(0, 200));
        
        // 调用AI评分（添加超时控制）
        console.log('🤖 [Step 3/5] 准备调用AI评分（30秒超时）...');
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => {
                console.error('⏱️ [Step 3/5] AI分析超时！');
                reject(new Error('AI分析超时（30秒），请检查网络连接或稍后重试'));
            }, 30000)
        );
        
        const gradingPromise = performHomeworkGrading(homeworkText);
        
        console.log('⏳ [Step 3/5] 等待AI响应...');
        const gradingResult = await Promise.race([gradingPromise, timeoutPromise]);
        
        console.log('✅ [Step 4/5] AI评分完成');
        console.log('📊 [Step 4/5] 结果类型:', typeof gradingResult);
        console.log('📊 [Step 4/5] 结果预览:', JSON.stringify(gradingResult).substring(0, 200));
        
        // 解析结果
        console.log('🔍 [Step 5/5] 解析评分结果...');
        let finalResult;
        
        if (typeof gradingResult === 'string') {
            console.log('📝 [Step 5/5] 结果为字符串，尝试解析...');
            finalResult = parseGradingResult(gradingResult);
        } else {
            console.log('✅ [Step 5/5] 结果已是对象格式');
            finalResult = gradingResult;
        }
        
        console.log('🎉 [Step 5/5] 文本作业阅卷完成！');
        console.log('📊 [Step 5/5] 最终结果:', finalResult);
        
        return finalResult;
        
    } catch (error) {
        console.error('❌ [Error] 文本作业阅卷失败');
        console.error('❌ [Error] 错误名称:', error.name);
        console.error('❌ [Error] 错误消息:', error.message);
        console.error('❌ [Error] 错误堆栈:', error.stack);
        
        // 确保错误信息友好
        if (error.message.includes('timeout') || error.message.includes('超时')) {
            throw new Error('AI分析超时，请检查网络连接后重试');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('网络')) {
            throw new Error('网络连接失败，请检查网络设置');
        } else {
            throw error;
        }
    }
}

// ==========================================
// 学生作业AI批改 - 根据分析条件批改学生作业
// ==========================================
async function gradeStudentHomeworkWithAI(data) {
    console.log('🤖 开始调用DeepSeek API批改学生作业...');
    
    const { studentAnswer, conditions, maxScore = 100, standardAnswer = '' } = data;
    
    // 计算每个细则的分值
    const criteriaCount = conditions.gradingCriteria?.length || 1;
    const scorePerCriterion = Math.floor(maxScore / criteriaCount);
    
    // 判断是否为选择题
    const isChoiceQuestion = conditions.homeworkType && 
        (conditions.homeworkType.includes('选择') || 
         conditions.homeworkType.includes('choice') ||
         conditions.homeworkType.includes('单选') ||
         conditions.homeworkType.includes('多选'));
    
    console.log('📌 [批改] 识别作业类型：' + (isChoiceQuestion ? '选择题' : '作文/分析题'));
    
    // 根据题型生成不同的提示词
    let gradingPrompt = '';
    let systemPrompt = '';
    
    if (isChoiceQuestion) {
        // ===== 选择题的专门提示词 =====
        systemPrompt = "你是一位关心学生、善于鼓励的教师，专门批改选择题。必须准确统计答题情况，返回有效的JSON格式。要明确指出正确率、错题编号、每题解析，同时保持鼓励和温暖的语气，让学生看到进步的可能性。";
        
        gradingPrompt = `你是一位关心学生的教师，需要批改学生的选择题答卷。

    【作业类型】
    ${conditions.homeworkType || '选择题'}

    【满分】${maxScore}分

    【参考答案/标准答案】
    ${standardAnswer || '无'}

    【学生答案】
    ${studentAnswer || '学生未提交答案'}

    【批改建议】
    ${conditions.gradingAdvice || '无'}

    【关键知识点/常见错误】
    ${conditions.commonMistakes ? conditions.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n') : '无'}

    【批改要求】
    1. 准确统计正确题数和正确率（百分比形式）
    2. 逐一列出错题：错题号、学生答案、正确答案、错误原因简析
    3. 对正确的题目，简要说明为什么正确（可选）
    4. 针对常犯的错误，提出改进建议（要有针对性）
    5. 最后给出总体评价，包含鼓励
    6. 语言简练、鼓励性强：
    - overallComment要包含对学生的夸奖（如："不错！"、"很有进步"、"相信你很快就能掌握"等）
    - 即使错题较多，也要先肯定做对的题目，再分析错误原因
    - 语气亲切、温暖

    【重要：必须严格返回以下JSON格式】
    \`\`\`json
    {
        "totalScore": 85,
        "correctCount": 17,
        "totalCount": 20,
        "accuracy": 85,
        "wrongQuestions": [
            {
            "questionNumber": 3,
            "studentAnswer": "B",
            "correctAnswer": "A",
            "explanation": "这道题考查的是...。正确答案是A因为...",
            "mistake": "学生可能混淆了..."
            },
            {
            "questionNumber": 7,
            "studentAnswer": "D",
            "correctAnswer": "C",
            "explanation": "这道题要求理解...。正确答案是C",
            "mistake": "需要注意的是..."
            }
        ],
        "overallComment": "很不错！你答对了17道题，正确率达到85%。这说明你对大部分知识点掌握得很好！对于出错的3道题，我在上面做了详细的解析。仔细理解这些知识点，下次一定能做得更好。加油！",
        "improvementAreas": ["需要加强对...的理解", "关于...的概念需要复习"],
        "encouragement": "你很用心地做了这份试卷，每一次的错误都是学习的机会。相信通过复习，你会进步得很快！",
        "aiGeneratedAnalysis": {
            "probability": 15,
            "reasons": [
            "答案组合较为离散，符合真实作答特征",
            "存在典型的学生易犯错误",
            "不是所有题都答对，体现真实水平"
            ]
        }
    }
    \`\`\`

    注意：
    1. wrongQuestions数组要包含所有错题
    2. correctCount和totalCount应该从学生答案中推断出来
    3. accuracy = Math.round((correctCount / totalCount) * 100)
    4. 如果没有错题，wrongQuestions应为空数组[]
    `;
        } else {
            // ===== 作文/分析题的强化提示词 =====
            systemPrompt = "你是一位温暖有爱、经验丰富的教师，擅长客观公正地批改作业，同时善于鼓励和激励学生。必须严格按照评分标准逐条评分，返回有效的JSON格式，并给出可执行的改进建议、情感支持、逻辑追问和文化表达提示。评语要简练但有温度。";

            gradingPrompt = `你是一位专业的教师，需要根据给定的评分标准逐条批改学生作业。

        【作业类型】
        ${conditions.homeworkType || '未分类'}

        // 【评分标准】（满分${maxScore}分，共${criteriaCount}条标准，每条约${scorePerCriterion}分）
        ${conditions.gradingCriteria ? conditions.gradingCriteria.map((c, i) => `${i + 1}. ${c} (${scorePerCriterion}分)`).join('\n') : '无'}

        【批改建议】
        ${conditions.gradingAdvice || '无'}

        【常见错误】
        ${conditions.commonMistakes ? conditions.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n') : '无'}

        ${standardAnswer ? `【参考答案/要求】\n${standardAnswer}\n\n` : ''}【学生答案】
        ${studentAnswer || '学生未提交答案'}

        【批改要求】
        1. 必须对每一条评分标准进行单独评分，说明得分原因
        2. 针对每条标准，明确指出：表现如何、得分多少、哪里需要改进
        3. 总评需包含鼓励性开头，控制在120-200字
        4. 生成一版更完善的“修改后参考答案”，突出改进点
        5. 语言简练：performance 与 improvement 各不超过40字；strengths/weaknesses 每条不超过15字
        6. 分层反馈：
           - totalScore < 80：优先改正语法/拼写/时态等基础问题
           - 80-90：给出可落地的优化建议（结构、衔接、词汇丰富度）
           - ≥90：提出更高要求（深度、批判性、创造性）
        7. 情感支持：给出一句温暖鼓励的“emotionalSupport”短句
        8. 逻辑与文化：指出逻辑漏洞并给出2-3个“logicQuestions”追问；提供2-3条“cultureTips”提升中英表达与文化得体性
        9. AI生成检测：
           - 给出AI生成可能性百分比（0-100%）
           - 标记疑似AI生成的句子，提供人工表达改写建议
           - 给出“aiUseGuidance”一句话，引导学生批判性、建设性地使用AI
        10. 错误归类：归纳常见错误类别（如冠词误用、时态混乱、句子不完整等）并统计出现次数
        11. 练习与微课：给出1-3条针对性的练习/微课推荐（标题+关注点，可虚拟占位）
        12. 能力画像：给出内容、逻辑、语言、衔接、创造力五个维度的得分(0-100)
        13. 成就徽章候选：根据表现推荐徽章，优先使用：纠错大师、结构模型大师、词汇衔接高手、逻辑思维明星、批判大师、创新大拿

        【重要：必须严格返回以下JSON格式】
        \`\`\`json
        {
        "totalScore": 85,
        "criteriaScores": [
            {
            "criterion": "评分标准1的内容",
            "score": 25,
            "maxScore": ${scorePerCriterion},
            "performance": "表现描述：学生在这一项做得如何",
            "improvement": "改进建议：需要加强什么"
            }
        ],
        "overallComment": "总体评价（鼓励性开头，120-200字内）",
        "strengths": ["优点1", "优点2"],
        "weaknesses": ["薄弱点1：具体说明"],
        "revisedAnswer": "根据改进建议生成的修改后参考答案",
        "aiGeneratedAnalysis": {
            "probability": 35,
            "reasons": ["判断依据1", "判断依据2"]
        },
        "aiUseGuidance": "一句话提醒学生批判性、建设性地使用AI",
        "commonErrorCategories": [
            {"category": "时态混乱", "count": 2, "examples": ["...", "..."]}
        ],
        "suspectedAISentences": [
            {"sentence": "可疑句子", "reason": "理由", "humanSuggestion": "更自然的人工表达"}
        ],
        "logicQuestions": ["追问1", "追问2"],
        "cultureTips": ["地道表达建议1", "文化差异提醒1"],
        "practiceRecommendations": [
            {"type": "微课", "title": "占位标题", "focus": "关注点"}
        ],
        "skillScores": {"content": 80, "logic": 78, "language": 82, "cohesion": 79, "creativity": 75},
        "feedbackTier": "starter|improver|advanced",
        "tierRationale": "分层依据",
        "emotionalSupport": "温暖鼓励短句",
        "badgeCandidates": ["纠错大师"],
        "longTermHint": "一句话描述长期改进方向"
        }
        \`\`\`

        注意：criteriaScores数组长度必须等于评分标准数量（${criteriaCount}条）；所有新增字段必须给出合理内容，保持简洁可执行。`;
        }

    try {
        console.log('🌐 发送AI批改请求...');
        console.log('📌 [批改] 识别作业类型：' + (isChoiceQuestion ? '选择题' : '作文/分析题'));
        const deepseekApiKey = await getApiKeyOrThrow();
        
        const response = await fetchWithTimeout(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${deepseekApiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: gradingPrompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 2500
            })
        }, 40000);
        
        console.log('📡 AI批改响应状态:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API错误响应:', errorText);
            throw new Error(`API请求失败: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ AI批改响应成功');
        
        if (!result.choices || !result.choices[0] || !result.choices[0].message) {
            throw new Error('API响应格式不正确');
        }
        
        const content = result.choices[0].message.content;
        console.log('📝 AI返回内容长度:', content.length);
        
        // 解析JSON响应
        const grading = parseJSONFromResponse(content);
        console.log('✅ 批改结果解析成功:', grading);
        
        // 验证并规范化返回格式
        const normalizedGrading = {
            // 支持新格式 totalScore，也兼容旧格式 score
            score: grading.totalScore || grading.score || maxScore * 0.8,
            comment: grading.overallComment || grading.comment || '作业已批改，请继续努力。',
            strengths: grading.strengths || [],
            weaknesses: grading.weaknesses || grading.improvements || [],
            // 新增：详细评分细则
            criteriaScores: grading.criteriaScores || [],
            // 新增：修改后参考答案
            revisedAnswer: grading.revisedAnswer || '',
            // 新增：AI生成检测分析
            aiGeneratedAnalysis: grading.aiGeneratedAnalysis || null,
            // 新增：引导学生批判性使用AI
            aiUseGuidance: grading.aiUseGuidance || '',
            // 新增：错误归类与高频统计
            commonErrorCategories: grading.commonErrorCategories || [],
            // 新增：疑似AI句子标记
            suspectedAISentences: grading.suspectedAISentences || [],
            // 新增：逻辑追问与文化提示
            logicQuestions: grading.logicQuestions || [],
            cultureTips: grading.cultureTips || [],
            // 新增：练习与微课推荐
            practiceRecommendations: grading.practiceRecommendations || [],
            // 新增：能力画像
            skillScores: grading.skillScores || null,
            // 新增：分层反馈与情感支持
            feedbackTier: grading.feedbackTier || '',
            tierRationale: grading.tierRationale || '',
            emotionalSupport: grading.emotionalSupport || '',
            // 新增：徽章候选与长期提示
            badgeCandidates: grading.badgeCandidates || [],
            longTermHint: grading.longTermHint || ''
        };
        
        // 验证分数范围
        normalizedGrading.score = Math.max(0, Math.min(maxScore, normalizedGrading.score));

        // 如果缺少分层标签，依据得分兜底生成
        if (!normalizedGrading.feedbackTier) {
            if (normalizedGrading.score >= 90) {
                normalizedGrading.feedbackTier = 'advanced';
            } else if (normalizedGrading.score >= 80) {
                normalizedGrading.feedbackTier = 'improver';
            } else {
                normalizedGrading.feedbackTier = 'starter';
            }
        }
        if (!normalizedGrading.skillScores) {
            normalizedGrading.skillScores = {
                content: Math.min(100, Math.max(0, Math.round(normalizedGrading.score)) ),
                logic: Math.min(100, Math.max(0, Math.round(normalizedGrading.score * 0.9)) ),
                language: Math.min(100, Math.max(0, Math.round(normalizedGrading.score * 0.95)) ),
                cohesion: Math.min(100, Math.max(0, Math.round(normalizedGrading.score * 0.9)) ),
                creativity: Math.min(100, Math.max(0, Math.round(normalizedGrading.score * 0.85)) )
            };
        }
        
        // 如果有详细评分细则，也验证每个细则的分数
        if (normalizedGrading.criteriaScores && normalizedGrading.criteriaScores.length > 0) {
            normalizedGrading.criteriaScores.forEach(item => {
                if (item.score !== undefined && item.maxScore !== undefined) {
                    item.score = Math.max(0, Math.min(item.maxScore, item.score));
                }
            });
        }
        
        console.log('✅ 规范化后的批改结果:', normalizedGrading);
        return normalizedGrading;
        
    } catch (error) {
        console.error('❌ AI批改失败:', error);
        throw error;
    }
}

// ==========================================
// 作业详情智能分析 - 用于分析作业类型和批改建议
// ==========================================
async function analyzeHomeworkDetailsWithAI(homeworkDetails) {
    console.log('🤖 开始调用DeepSeek API进行作业详情分析...');
    const loading = showLoadingState('作业详情分析');
    loading.show();
    loading.update(10, '准备分析数据');
    
    // 构建分析提示词
    const analysisPrompt = `你是一位有经验的教育专家，需要对以下作业题目进行智能分析。

    【作业信息】
    标题: ${homeworkDetails.title || '未提供'}
    满分: ${homeworkDetails.maxScore || '未提供'}
    截止时间: ${homeworkDetails.deadline || '未提供'}
    要求: ${homeworkDetails.requirements || '未提供'}
    知识点: ${Array.isArray(homeworkDetails.knowledgePoints) ? homeworkDetails.knowledgePoints.join('；') : '未提供'}
    ${homeworkDetails.attachments && homeworkDetails.attachments.length > 0 ? `附件: ${homeworkDetails.attachments.map(f => f.name).join('、')}` : ''}

    【作业题目/内容】
    ${homeworkDetails.content || '未提供'}

    ${homeworkDetails.attachmentSummaryFull ? `【附件完整内容】
${homeworkDetails.attachmentSummaryFull}

⚠️ 重要：上述附件包含多道题目，您必须逐题分析（不要只分析第1题），确保每道题都有对应的答案和解析。` : ''}

    ${homeworkDetails.teacherProvidedAnswer ? `【老师提供的参考答案】
    ${homeworkDetails.teacherProvidedAnswer}` : ''}

    【您的任务】
    1. 判断这是什么类型的作业（如：选择题、填空题、简答题、论述题、实践题等）
    2. 分析这类作业应该如何评分
    3. 提供详细的批改建议${homeworkDetails.attachments && homeworkDetails.attachments.length > 0 ? '（注意：学生已提交附件文件，已为您提供完整内容，批改时应结合所有题目进行，确保逐题分析）' : ''}
    4. 列举常见的学生错误
    5. 生成答案部分：
       - 如果老师已提供参考答案：referenceAnswer 必须直接使用老师答案（不要改写）
       - 如果老师未提供：基于题干和附件材料推导参考答案
       - 客观题(选择题)格式：
         答案：1.A 2.B 3.C ...
         逐题解析：
         1. 答案：A
            解析：按做题思路说明（题干关键词 + 选项对比 + 排除理由）
         2. 答案：B
            解析：按做题思路说明
       - 主观题格式：提供范文或答题要点

    【重要：必须返回以下JSON格式】
    \`\`\`json
    {
    "homeworkType": "作业类型分类，如：选择题/客观题",
    "typeExplanation": "对作业类型的简要说明",
    "gradingCriteria": [
        "评分标准1：具体说明",
        "评分标准2：具体说明",
        "评分标准3：具体说明"
    ],
    "gradingAdvice": "详细的批改建议，包括如何评分、注意事项等",
    "commonMistakes": [
        "常见错误1：学生可能会...",
        "常见错误2：学生容易...",
        "常见错误3：需要注意..."
    ],
    "referenceAnswerType": "objective 或 model_essay",
    "referenceAnswerSource": "teacher 或 inferred",
    "referenceAnswer": "必须包含完整答案和解析"
    }
    \`\`\``;

    try {
        console.log('🌐 发送API请求...');
        loading.update(35, '发送请求');
        const deepseekApiKey = await getApiKeyOrThrow();
        
        const response = await fetchWithTimeout(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${deepseekApiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "你是一位专业的教师和教育评估专家。请根据作业信息提供专业的分析和建议。必须返回有效的JSON格式。"
                    },
                    {
                        role: "user",
                        content: analysisPrompt
                    }
                ],
                temperature: 0.5,
                max_tokens: 2000
            })
        }, 30000);
        
        console.log('📡 API响应状态:', response.status, response.statusText);
        loading.update(70, '收到响应');
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API错误响应:', errorText);
            loading.update(100, '请求失败');
            throw new Error(`API请求失败: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ API响应成功');
        loading.update(85, '解析结果');
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('❌ API响应格式错误:', data);
            throw new Error('API响应格式不正确');
        }
        
        const content = data.choices[0].message.content;
        console.log('📝 AI返回内容长度:', content.length);
        
        // 解析JSON响应
        const parsedAnalysis = parseJSONFromResponse(content);
        console.log('✅ 作业分析解析成功:', parsedAnalysis);
        loading.hide();
        
        return parsedAnalysis;
        
    } catch (error) {
        console.error('❌ 作业详情分析失败 - 详细错误:', error);
        loading.update(100, '出现错误');
        
        // 返回友好的错误信息
        if (error.message.includes('Failed to fetch')) {
            throw new Error('网络连接失败，请检查网络后重试');
        } else if (error.message.includes('timeout')) {
            throw new Error('API请求超时，请稍后重试');
        } else {
            throw error;
        }
    }
}

// ==========================================
// 简化的屏幕截图函数（改进版 - 支持全屏模式）
// ==========================================
async function captureScreenSimple(useFullScreen = true) {
    let isFullScreenEntered = false;
    let activeTabId = null;
    
    try {
        // 获取当前活跃标签页
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            throw new Error('无法获取当前标签页');
        }
        activeTabId = tabs[0].id;
        
        // 如果启用全屏模式
        if (useFullScreen) {
            console.log('📺 [截图] 尝试进入全屏模式以获得更好的截图质量...');
            
            try {
                // 发送消息给content.js进入全屏
                await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(activeTabId, { action: 'enterFullScreen' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn('⚠️ [截图] 全屏切换失败:', chrome.runtime.lastError.message);
                            resolve(false);
                        } else if (response && response.success) {
                            console.log('✅ [截图] 已进入全屏模式');
                            isFullScreenEntered = true;
                            resolve(true);
                        } else {
                            console.warn('⚠️ [截图] 全屏切换响应异常');
                            resolve(false);
                        }
                    });
                });
                
                // 等待全屏动画和内容重排完成
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.warn('⚠️ [截图] 全屏切换异常:', error.message);
                // 继续执行截图，即使全屏失败
            }
        }
        
        console.log('📸 [截图] 开始截图...');
        const dataUrl = await chrome.tabs.captureVisibleTab(null, {
            format: 'png',
            quality: 90
        });
        console.log('✅ [截图] 截图成功，数据大小:', dataUrl.length);
        
        return { dataUrl, isFullScreen: isFullScreenEntered };
        
    } catch (error) {
        console.error('❌ [截图] 截图失败:', error);
        if (error.message.includes('Cannot access')) {
            throw new Error('无法访问当前页面进行截图。请确保页面已完全加载，或尝试刷新页面后重试。');
        } else if (error.message.includes('permission')) {
            throw new Error('缺少截图权限。请检查插件权限设置。');
        } else {
            throw new Error(`截图功能暂时不可用: ${error.message}`);
        }
    } finally {
        // 退出全屏模式
        if (isFullScreenEntered && activeTabId) {
            try {
                console.log('📺 [截图] 尝试退出全屏模式...');
                await new Promise((resolve) => {
                    chrome.tabs.sendMessage(activeTabId, { action: 'exitFullScreen' }, (response) => {
                        if (response && response.success) {
                            console.log('✅ [截图] 已退出全屏模式');
                        } else {
                            console.warn('⚠️ [截图] 退出全屏失败');
                        }
                        resolve();
                    });
                });
                // 等待退出全屏完成
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.warn('⚠️ [截图] 退出全屏异常:', error.message);
            }
        }
    }
}

// 图像分析函数（增强版本 - 集成OCR和AI分析）
// ==========================================
// 作业专用阅卷函数 - 返回结构化评分数据
// ==========================================
async function analyzeHomeworkWithAI(imageData, selectionInfo) {
    try {
        console.log('=== 开始作业阅卷流程 ===');
        console.log('图片数据长度:', imageData.length);
        
        // 第一步：使用OCR识别图片中的文字
        const extractedText = await performOCR(imageData);
        
        if (!extractedText || extractedText.trim().length === 0) {
            return {
                success: false,
                error: '文字识别失败',
                message: '未能从图片中识别到文字内容'
            };
        }
        
        console.log('OCR识别成功，文字长度:', extractedText.length);
        console.log('识别到的文字预览:', extractedText.substring(0, 100));
        
        // 第二步：使用AI进行作业阅卷，返回结构化数据
        console.log('开始AI评分分析...');
        const gradingResult = await performHomeworkGrading(extractedText);
        
        // 确保返回结构化数据
        if (typeof gradingResult === 'string') {
            // 如果AI返回文本，需要解析它
            return parseGradingResult(gradingResult);
        }
        
        return gradingResult;
        
    } catch (error) {
        console.error('作业阅卷失败:', error);
        return {
            success: false,
            error: error.message,
            message: '作业阅卷过程中出现错误'
        };
    }
}

// ==========================================
// AI作业阅卷核心函数 - 返回结构化评分数据
// ==========================================
async function performHomeworkGrading(homeworkText) {
    
    const gradingPrompt = `你是一位有经验的教师，需要对学生的客观题（选择题）作业进行批改。

    【学生答卷内容】
    ${homeworkText}

    【阅卷要求】
    1. 识别每个题目区间的学生答案（如：1-5题、6-10题等）
    2. 对比每道题的正误，计算该区间的得分
    3. 每个区间满分为25分，每错一题扣1分
    4. 生成详细的评分理由

    【重要：必须返回以下JSON格式】
    \`\`\`json
    {
    "totalScore": 85,
    "items": [
        {
        "section": "第1-5题",
        "studentAnswers": "ABCAB",
        "correctAnswers": "ABCAB",
        "score": 25,
        "maxScore": 25,
        "errors": [],
        "feedback": "学生答案与正确答案完全一致，得满分。"
        },
        {
        "section": "第6-10题",
        "studentAnswers": "AAAAD",
        "correctAnswers": "ABCDD",
        "score": 20,
        "maxScore": 25,
        "errors": ["第6题错误", "第7题错误", "第9题错误"],
        "feedback": "学生答案在第6、7、9题出现错误，共扣5分。"
        }
    ],
    "totalFeedback": "总体评价：学生回答较为认真，但存在一定的知识漏洞。建议重点复习第6-10题相关知识点。"
    }
    \`\`\`

    请严格按照上述JSON格式返回结果，确保所有数值正确。`;

    try {
        const deepseekApiKey = await getApiKeyOrThrow();
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${deepseekApiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { 
                        role: "system", 
                        content: "你是一位专业的教师，精通客观题批改和成绩评定。必须返回有效的JSON格式。" 
                    },
                    { 
                        role: "user", 
                        content: gradingPrompt 
                    }
                ],
                temperature: 0.3,
                max_tokens: 3000
            })
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API 响应格式错误');
        }
        
        const content = data.choices[0].message.content;
        console.log('✅ AI评分完成');
        console.log('AI返回内容:', content);
        
        // 尝试解析JSON
        return parseJSONFromResponse(content);
        
    } catch (error) {
        console.error('❌ 作业阅卷失败:', error);
        throw error;
    }
}

// 从AI响应中解析JSON
function parseJSONFromResponse(response) {
    try {
        // 尝试直接解析
        const parsed = JSON.parse(response);
        if (parsed && parsed.totalScore !== undefined) {
            return parsed;
        }
    } catch (e) {
        // 尝试从```json...```中提取
        const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (e2) {
                console.log('JSON in code block parse failed:', e2);
            }
        }
        
        // 尝试从花括号中提取
        const braceMatch = response.match(/\{[\s\S]*\}/);
        if (braceMatch) {
            try {
                return JSON.parse(braceMatch[0]);
            } catch (e3) {
                console.log('JSON in braces parse failed:', e3);
            }
        }
    }
    
    // 如果无法解析，返回文本响应进行备选处理
    console.warn('无法解析JSON，返回文本供后续处理');
    return response;
}

// 解析阅卷结果（如果AI返回文本而非JSON）
function parseGradingResult(text) {
    console.log('🔍 解析评分结果...');
    
    const result = {
        totalScore: 0,
        items: [],
        totalFeedback: text,
        parsedFromText: true
    };
    
    // 尝试提取总分
    const totalMatch = text.match(/(?:总分|总体得分|总体)[：:]*\s*(\d+)\s*分?/);
    if (totalMatch) {
        result.totalScore = parseInt(totalMatch[1]);
    }
    
    // 尝试提取各题区间的分数
    const sectionMatches = text.matchAll(/(?:第?\s*(\d+)\s*[-～到至]\s*(\d+)\s*题?|(?:题目|第)?\s*(\d+)\s*题?[：:]).*?(?:(\d+)\s*\/\s*(\d+)|(\d+)\s*分)/g);
    for (const match of sectionMatches) {
        const startNum = match[1] || match[3];
        const endNum = match[2] || match[3];
        const score = match[4] || match[6];
        const maxScore = match[5];
        
        if (startNum && score) {
            result.items.push({
                section: `第${startNum}-${endNum}题`,
                score: parseInt(score),
                maxScore: maxScore ? parseInt(maxScore) : 25
            });
        }
    }
    
    return result;
}

// OCR文字识别函数 - 支持中英文混合识别
async function performOCR(imageData) {
    try {
        console.log('开始OCR文字识别，图片大小:', imageData.length);
        
        // 尝试多种语言识别
        const languages = ['chs', 'eng', 'cht']; // 简体中文、英文、繁体中文
        
        for (let i = 0; i < languages.length; i++) {
            const lang = languages[i];
            console.log(`尝试${lang}语言识别...`);
            
            try {
                const ocrResult = await callOnlineOCRWithLanguage(imageData, lang);
                if (ocrResult && ocrResult.trim().length > 0) {
                    console.log(`${lang}语言识别成功，文字长度:`, ocrResult.length);
                    // 对识别结果进行自动排版
                    const formattedText = formatOCRText(ocrResult, lang);
                    return formattedText;
                }
            } catch (error) {
                console.log(`${lang}语言识别失败:`, error.message);
                // 继续尝试下一种语言
            }
        }
        
        // 所有语言都失败，返回错误
        throw new Error('无法识别图片中的文字内容。请确保：\n1. 图片中包含清晰的文字\n2. 文字大小适中，不要太小\n3. 背景与文字有足够对比度');
        
    } catch (error) {
        console.error('OCR识别完全失败:', error);
        throw error;
    }
}

// 指定语言的OCR识别
async function callOnlineOCRWithLanguage(imageData, language) {
    try {
        console.log(`调用${language}语言OCR服务...`);
        const ocrApiKey = await getApiKeyOrThrow();
        
        // 将base64数据转换为可用格式
        const base64Data = imageData.split(',')[1];
        
        const formData = new FormData();
        formData.append('base64Image', `data:image/png;base64,${base64Data}`);
        formData.append('apikey', ocrApiKey);
        formData.append('language', language);
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2');
        
        const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData
        });
        
        if (!ocrResponse.ok) {
            throw new Error(`OCR API请求失败: ${ocrResponse.status}`);
        }
        
        const ocrData = await ocrResponse.json();
        console.log(`${language}语言OCR响应:`, ocrData);
        
        if (ocrData.OCRExitCode === 1 && ocrData.ParsedResults && ocrData.ParsedResults.length > 0) {
            const extractedText = ocrData.ParsedResults[0].ParsedText;
            if (extractedText && extractedText.trim().length > 0) {
                return extractedText.trim();
            }
        }
        
        throw new Error(`${language}语言未识别到文字内容`);
        
    } catch (error) {
        throw new Error(`${language}语言OCR失败: ${error.message}`);
    }
}

// OCR文字自动排版函数 - 支持中英文混合
function formatOCRText(rawText, language = 'auto') {
    if (!rawText || rawText.trim().length === 0) {
        return rawText;
    }
    
    let formatted = rawText.trim();
    
    // 1. 处理换行和空格
    formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 2. 根据语言类型进行不同的处理
    if (language === 'chs' || language === 'cht' || /[\u4e00-\u9fff]/.test(formatted)) {
        // 中文文本处理
        console.log('检测到中文内容，使用中文排版规则');
        
        // 处理中文标点符号
        formatted = formatted.replace(/\s*([，。！？；：])\s*/g, '$1');
        
        // 处理中英文混合时的空格
        formatted = formatted.replace(/([a-zA-Z0-9])\s*([，。！？；：])/g, '$1$2');
        formatted = formatted.replace(/([，。！？；：])\s*([a-zA-Z0-9])/g, '$1 $2');
        
        // 中英文之间添加空格
        formatted = formatted.replace(/([a-zA-Z0-9])([\u4e00-\u9fff])/g, '$1 $2');
        formatted = formatted.replace(/([\u4e00-\u9fff])([a-zA-Z0-9])/g, '$1 $2');
        
        // 处理段落
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        
    } else {
        // 英文文本处理
        console.log('检测到英文内容，使用英文排版规则');
        
        // 合并被错误分割的单词
        formatted = formatted.replace(/([a-z])\s+([a-z])/g, '$1$2');
        formatted = formatted.replace(/([A-Z])\s+([a-z])/g, '$1$2');
        
        // 修复句子间的空格
        formatted = formatted.replace(/([.!?])\s*\n\s*/g, '$1\n\n');
        formatted = formatted.replace(/([.!?])\s+([A-Z])/g, '$1 $2');
        
        // 处理段落
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        formatted = formatted.replace(/\n\s+/g, '\n');
        
        // 修复常见的OCR错误
        formatted = formatted.replace(/\s+/g, ' ');
        formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');
        
        // 处理标点符号
        formatted = formatted.replace(/\s+([,.!?;:])/g, '$1');
        formatted = formatted.replace(/([,.!?;:])\s*([a-zA-Z])/g, '$1 $2');
        
        // 处理段落开头
        const lines = formatted.split('\n');
        const processedLines = lines.map(line => {
            line = line.trim();
            if (line.length > 0) {
                line = line.charAt(0).toUpperCase() + line.slice(1);
            }
            return line;
        });
        formatted = processedLines.join('\n');
    }
    
    // 通用清理
    formatted = formatted.replace(/\s+$/gm, ''); // 去除行尾空格
    formatted = formatted.trim();
    
    console.log('OCR文字排版完成，原长度:', rawText.length, '排版后长度:', formatted.length);
    
    return formatted;
}


// 处理标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.includes('zhihuishu.com')) {
            console.log('Detected Zhihuishu website, enhanced features available');
        }
    }
});
