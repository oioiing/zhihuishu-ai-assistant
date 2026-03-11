// 最小化测试版本 - 用于诊断 Service Worker 问题
console.log('🚀 [Background] Service Worker 测试版本启动...');
console.log('⏰ [Background] 启动时间:', new Date().toISOString());

// 立即注册一个简单的消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 [Background] 收到消息:', request.action);
    
    if (request.action === 'ping') {
        console.log('🏓 [Background] Ping - 响应中...');
        sendResponse({ success: true, message: 'pong', timestamp: Date.now() });
        return false;
    }
    
    sendResponse({ success: false, error: '未知操作: ' + request.action });
    return false;
});

console.log('✅ [Background] 消息监听器已注册');
console.log('✅ [Background] Service Worker 初始化完成');

// 安装事件
chrome.runtime.onInstalled.addListener((details) => {
    console.log('📦 [Background] 扩展已安装/更新:', details.reason);
});

// 启动事件
chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 [Background] Service Worker 重新启动');
});

console.log('💚 [Background] 所有事件监听器已注册');
