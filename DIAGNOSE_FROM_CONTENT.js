// =============================================
// Content Script 诊断工具
// =============================================
// 这个工具使用 content script 暴露的全局函数进行诊断
// 在智慧树页面控制台运行

console.log('🔍 ========== Content Script 诊断工具 ==========');
console.log('');

// 检查 content script 是否已加载
if (typeof window.zhsExtensionLoaded !== 'undefined') {
    console.log('✅ Content script 已加载');
    console.log('  扩展标识:', window.zhsExtensionLoaded);
} else {
    console.error('❌ Content script 未加载');
    console.log('  未检测到 window.zhsExtensionLoaded');
}

// 检查是否有浮窗球
const floatingBall = document.querySelector('.zhs-floating-ball, [data-zhs-floating="true"]');
if (floatingBall) {
    console.log('✅ 浮窗球元素已创建');
    console.log('  位置:', floatingBall.style.right, floatingBall.style.bottom);
} else {
    console.warn('⚠️ 未找到浮窗球元素');
}

// 检查是否有日志管理器
if (typeof window.logManager !== 'undefined') {
    console.log('✅ 日志管理器已初始化');
    try {
        window.logManager.printStatistics();
    } catch (e) {
        console.log('  日志统计不可用');
    }
} else {
    console.warn('⚠️ 日志管理器不可用');
}

// 检查缓存管理器
if (typeof window.cacheManager !== 'undefined') {
    console.log('✅ 缓存管理器已初始化');
    try {
        window.cacheManager.printStats();
    } catch (e) {
        console.log('  缓存统计不可用');
    }
} else {
    console.warn('⚠️ 缓存管理器不可用');
}

console.log('');
console.log('📊 控制台日志检查：');
console.log('  向上滚动查找以下日志：');
console.log('  - 📊 日志系统已初始化');
console.log('  - 🔄 智能重试系统已初始化');
console.log('  - 💾 多层缓存系统已初始化');
console.log('  - ✅ [createFloatingBall] 浮窗球已成功创建');
console.log('');

console.log('🔧 通信问题诊断：');
console.log('  从日志来看：');
console.log('  1. Content script ✅ 已运行');
console.log('  2. sendMessage() ✅ 能调用');
console.log('  3. Service Worker ❌ 未响应');
console.log('');
console.log('💡 下一步检查 Service Worker：');
console.log('  1. 打开 chrome://extensions/');
console.log('  2. 找到"智慧树 AI 助教"');
console.log('  3. 点击 "service worker" 链接（如果显示 inactive，先点击激活）');
console.log('  4. 查看是否有以下日志：');
console.log('     - 🚀 [Background] Service Worker 正在启动...');
console.log('     - ✅ [Background] 早期 Ping 监听器已注册');
console.log('     - 💓 [Background] Service Worker 保活机制已启动');
console.log('  5. 如果没有日志，说明 background.js 有错误');
console.log('  6. 查看 Service Worker DevTools 中的 Errors 标签');

console.log('');
console.log('====================================');
