// 快速 URL 检查工具 - 不依赖扩展 API
// 复制到控制台运行

console.log('🔍 ========== URL 匹配检查 ==========');
console.log('');
console.log('📍 当前页面信息：');
console.log('  完整 URL:', window.location.href);
console.log('  域名:', window.location.hostname);
console.log('  路径:', window.location.pathname);
console.log('');

// 检查是否匹配扩展规则
const url = window.location.href;
const hostname = window.location.hostname;

const matchRules = [
    { pattern: 'zhihuishu.com', desc: 'zhihuishu.com/*' },
    { pattern: 'www.zhihuishu.com', desc: 'www.zhihuishu.com/*' },
    { pattern: 'polymas.com', desc: '*.polymas.com/*' },
    { pattern: 'hike-teaching-center.polymas.com', desc: 'hike-teaching-center.polymas.com/*' }
];

console.log('📋 URL 匹配规则检查：');
let matched = false;
matchRules.forEach(rule => {
    const isMatch = hostname.includes(rule.pattern) || url.includes(rule.pattern);
    console.log(`  ${isMatch ? '✅' : '❌'} ${rule.desc}`, isMatch ? '' : '(不匹配)');
    if (isMatch) matched = true;
});

console.log('');
if (matched) {
    console.log('✅ URL 匹配扩展规则，content script 应该注入');
    console.log('');
    console.log('❌ 但是 chrome.runtime 不存在，说明：');
    console.log('1. 扩展未启用或未加载');
    console.log('2. Content script 加载失败（语法错误）');
    console.log('3. 页面在扩展安装前已打开（需要刷新）');
    console.log('');
    console.log('🔧 请执行：');
    console.log('1. 打开新标签页：chrome://extensions/');
    console.log('2. 找到"智慧树 AI 助教"扩展');
    console.log('3. 确认扩展已启用（蓝色开关）');
    console.log('4. 点击刷新按钮 🔄');
    console.log('5. 查看是否有错误提示');
    console.log('6. 如果有"service worker"链接，点击查看日志');
    console.log('7. 返回此页面，按 F5 刷新');
    console.log('8. 查看控制台是否有扩展的初始化日志（如 "📊 日志系统已初始化"）');
} else {
    console.error('❌ URL 不匹配扩展规则！');
    console.log('');
    console.log('扩展配置的匹配规则：');
    matchRules.forEach(rule => {
        console.log(`  - ${rule.desc}`);
    });
    console.log('');
    console.log('🔧 解决方法：');
    console.log('1. 确保在智慧树教学中心页面使用');
    console.log('2. URL 应包含 zhihuishu.com 或 polymas.com');
    console.log('3. 如需在其他页面使用，需修改 manifest.json 的 matches 配置');
}

console.log('');
console.log('====================================');
