// 渐进式诊断版本 - 逐步添加功能
console.log('🚀 [Background] Service Worker 正在启动...');
console.log('⏰ [Background] 启动时间:', new Date().toISOString());

// ==========================================
// 第1步：基本配置
// ==========================================
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_API_KEY = 'sk-a3b946955f5f4412973421a1a86421db';
const STORAGE_KEYS = {
    apiKey: 'zhai_api_key',
    logLevel: 'zhai_log_level',
    runtimeMetrics: 'zhai_runtime_metrics'
};

console.log('✅ 步骤1: 基本配置已加载');

// ==========================================
// 第2步：辅助函数
// ==========================================
function maskApiKeyForDisplay(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return '';
    if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
    const start = apiKey.slice(0, 6);
    const end = apiKey.slice(-4);
    const maskLength = Math.max(4, apiKey.length - 10);
    return `${start}${'*'.repeat(maskLength)}${end}`;
}

function sanitizeRequestForLogging(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        return Object.assign({}, obj);
    }
}

async function getStoredApiKey() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEYS.apiKey]);
        const apiKey = result?.[STORAGE_KEYS.apiKey];
        const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
        return trimmed || DEFAULT_DEEPSEEK_API_KEY;
    } catch (error) {
        console.warn('读取API Key失败，使用默认值');
        return DEFAULT_DEEPSEEK_API_KEY;
    }
}

console.log('✅ 步骤2: 辅助函数已加载');

// ==========================================
// 第3步：注册消息监听器
// ==========================================
console.log('🔧 [Background] 正在注册消息监听器...');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const actionName = request?.action || 'unknown';
    
    // ping 请求立即响应
    if (request.action === 'ping') {
        console.log('🏓 [Background] Ping - 立即同步响应');
        sendResponse({ success: true, message: 'pong', timestamp: Date.now() });
        return false;
    }
    
    console.log('📨 [Background] 收到消息:', request.action);
    
    // 其他消息暂时返回未实现
    sendResponse({ success: false, error: '功能尚未实现: ' + request.action });
    return false;
});

console.log('✅ 步骤3: 消息监听器已注册');

// ==========================================
// 第4步：生命周期事件
// ==========================================
chrome.runtime.onInstalled.addListener((details) => {
    console.log('📦 [Background] 扩展已安装/更新:', details.reason);
});

chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 [Background] Service Worker 重新启动');
});

console.log('✅ 步骤4: 生命周期事件已注册');

// ==========================================
// 第5步：保活机制
// ==========================================
let keepAliveInterval = null;
function startKeepAlive() {
    if (keepAliveInterval) return;
    keepAliveInterval = setInterval(() => {
        chrome.runtime.getPlatformInfo().catch(() => {
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
        });
    }, 20000);
    console.log('💓 [Background] Service Worker 保活机制已启动');
}

startKeepAlive();

console.log('✅ 步骤5: 保活机制已启动');
console.log('✅ [Background] Service Worker 初始化完成');
console.log('💚 [Background] 所有步骤完成，等待消息...');
