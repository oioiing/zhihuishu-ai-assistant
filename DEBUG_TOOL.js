// ==================================
// 扩展通信诊断工具 v2.0
// ==================================
// 使用方法：在智慧树页面的浏览器控制台(F12)中复制粘贴并执行此脚本
// ⚠️ 重要：必须在主页面（非 iframe）的控制台中运行

(async function diagnoseExtension() {
    console.log('🔍 ========== 扩展诊断工具开始 ==========');
    
    // 0. 检查运行上下文
    console.log('\n📋 步骤 0: 检查运行环境');
    console.log('  当前 URL:', window.location.href);
    console.log('  是否在 iframe 中:', window.self !== window.top ? '⚠️ 是（需要在主框架运行）' : '✅ 否（正确）');
    console.log('  页面标题:', document.title);
    
    if (window.self !== window.top) {
        console.error('❌ 检测到您在 iframe 中打开了控制台！');
        console.log('');
        console.log('🔧 正确的操作步骤：');
        console.log('1. 在页面空白处右键点击');
        console.log('2. 选择"检查"（或按 F12）');
        console.log('3. 确保控制台顶部显示的是主页面地址，而不是 iframe 地址');
        console.log('4. 重新运行此诊断工具');
        console.log('');
        console.log('💡 提示：如果控制台顶部有下拉菜单，选择"top"或主页面框架');
        return;
    }
    
    // 检查 URL 是否匹配
    const url = window.location.href;
    const isMatchingUrl = url.includes('zhihuishu.com') || url.includes('polymas.com');
    console.log('  URL 匹配扩展规则:', isMatchingUrl ? '✅ 匹配' : '❌ 不匹配');
    
    if (!isMatchingUrl) {
        console.warn('⚠️ 当前 URL 可能不在扩展的匹配范围内');
        console.log('   支持的域名: zhihuishu.com, polymas.com');
    }
    
    // 1. 检查 Chrome 扩展 API
    console.log('\n📋 步骤 1: 检查 Chrome 扩展 API');
    console.log('  chrome 对象:', typeof chrome !== 'undefined' ? '✅ 存在' : '❌ 不存在');
    console.log('  chrome.runtime:', typeof chrome?.runtime !== 'undefined' ? '✅ 存在' : '❌ 不存在');
    
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        console.error('❌ Chrome 扩展 API 不可用！');
        console.log('');
        console.log('🔍 可能的原因：');
        console.log('1. Content script 未注入到当前页面');
        console.log('2. 您在 iframe 中运行了诊断工具（请在主框架运行）');
        console.log('3. 扩展未正确加载或已禁用');
        console.log('4. 当前页面 URL 不匹配扩展的运行规则');
        console.log('');
        console.log('🔧 解决步骤：');
        console.log('1. 确认您在智慧树的主页面（URL 包含 zhihuishu.com 或 polymas.com）');
        console.log('2. 按 F5 刷新页面');
        console.log('3. 等待页面完全加载');
        console.log('4. 在页面空白处右键 -> 检查，确保不是在 iframe 中');
        console.log('5. 重新运行此诊断工具');
        console.log('');
        console.log('6. 如果仍然失败，打开 chrome://extensions/ 检查扩展状态');
        return;
    }
    
    // 2. 检查扩展上下文
    console.log('\n📋 步骤 2: 检查扩展上下文');
    console.log('  扩展 ID:', chrome.runtime.id || '❌ 未定义');
    
    if (!chrome.runtime.id) {
        console.error('❌ 扩展上下文无效，请刷新页面后重试');
        return;
    }
    
    // 3. 获取 manifest 信息
    console.log('\n📋 步骤 3: 获取扩展信息');
    try {
        const manifest = chrome.runtime.getManifest();
        console.log('  扩展名称:', manifest.name);
        console.log('  扩展版本:', manifest.version);
        console.log('  Manifest 版本:', manifest.manifest_version);
        console.log('  Background:', manifest.background?.service_worker ? '✅ Service Worker' : '❌ 未配置');
    } catch (error) {
        console.error('  ❌ 无法获取 manifest:', error.message);
    }
    
    // 4. 测试消息通信
    console.log('\n📋 步骤 4: 测试消息通信');
    console.log('  发送 ping 消息到 background...');
    
    const testMessage = async (timeout = 5000) => {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`超时（${timeout}ms）`));
            }, timeout);
            
            try {
                chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
                    clearTimeout(timeoutId);
                    
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    
                    resolve(response);
                });
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    };
    
    // 尝试多次 ping
    for (let i = 0; i < 3; i++) {
        try {
            console.log(`  尝试 ${i + 1}/3...`);
            const response = await testMessage(5000);
            
            if (response && response.success) {
                console.log('  ✅ Ping 成功！');
                console.log('  响应:', response);
                console.log('\n✅ ========== 诊断完成：通信正常 ==========');
                return;
            } else {
                console.warn('  ⚠️ 收到响应但状态异常:', response);
            }
        } catch (error) {
            console.error(`  ❌ 尝试 ${i + 1} 失败:`, error.message);
            
            if (i < 2) {
                console.log(`  等待 ${(i + 1) * 1000}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, (i + 1) * 1000));
            }
        }
    }
    
    console.error('\n❌ ========== 诊断完成：通信失败 ==========');
    console.log('\n🔧 建议的修复步骤：');
    console.log('1. 打开 chrome://extensions/');
    console.log('2. 找到"智慧树 AI 助教"扩展');
    console.log('3. 点击刷新按钮 🔄');
    console.log('4. 检查是否有错误提示');
    console.log('5. 点击"service worker"链接，查看 background 日志');
    console.log('6. 刷新当前页面后重新运行此诊断工具');
})();


// ==================================
// 附件解析专项调试工具
// ==================================
// 使用方法：在作业详情页面的控制台中执行
// debugAttachments() - 完整测试
// quickCheckAttachments() - 快速检查

window.debugAttachments = async function() {
    console.log('🔧 ==================== 开始调试附件解析 ====================');
    console.log('⏰ 时间:', new Date().toLocaleString());
    
    // 1. 检查页面上的附件元素
    console.log('\n📋 第一步：检查页面上的附件元素');
    const attachmentElements = document.querySelectorAll('.file-list .file-item, .attachment-item, [class*="attach"], [class*="file"]');
    console.log(`找到 ${attachmentElements.length} 个疑似附件元素`);
    
    attachmentElements.forEach((el, idx) => {
        console.log(`  附件${idx + 1}:`, {
            className: el.className,
            innerHTML: el.innerHTML.substring(0, 100),
            textContent: el.textContent.trim().substring(0, 50)
        });
    });
    
    // 2. 提取附件信息
    console.log('\n📎 第二步：提取附件名称和链接');
    const attachments = [];
    
    // 方法1：标准附件列表
    document.querySelectorAll('.file-list .file-item').forEach(item => {
        const nameEl = item.querySelector('.file-name, .filename, [class*="name"]');
        const linkEl = item.querySelector('a[href*=".docx"], a[href*=".pdf"], a[download]');
        
        if (nameEl) {
            attachments.push({
                name: nameEl.textContent.trim(),
                url: linkEl?.href || '(未找到链接)',
                element: item
            });
        }
    });
    
    console.log(`提取到 ${attachments.length} 个附件`);
    attachments.forEach((att, idx) => {
        console.log(`  附件${idx + 1}:`, {
            name: att.name,
            url: att.url.substring(0, 100)
        });
    });
    
    // 3. 测试URL提取（模拟自动点击）
    console.log('\n🖱️  第三步：测试URL提取（自动点击预览）');
    for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        console.log(`\n处理附件 ${i + 1}: ${att.name}`);
        
        // 查找预览按钮
        const previewBtn = att.element.querySelector('.file-preview, .preview-btn, [class*="preview"]');
        if (previewBtn) {
            console.log('  找到预览按钮，尝试点击...');
            previewBtn.click();
            
            // 等待100ms
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 查找新打开的iframe或弹窗
            const iframe = document.querySelector('iframe[src*="preview"], iframe[src*=".docx"]');
            if (iframe) {
                console.log('  ✅ 预览iframe已打开:', iframe.src.substring(0, 100));
                att.extractedUrl = iframe.src;
            } else {
                console.log('  ⚠️  未找到预览iframe');
            }
        } else {
            console.log('  ⚠️  未找到预览按钮');
        }
    }
    
    // 4. 测试下载和解析（仅第一个附件）
    if (attachments.length > 0 && attachments[0].extractedUrl) {
        console.log('\n⬇️  第四步：测试下载和解析（第一个附件）');
        const testUrl = attachments[0].extractedUrl;
        const testName = attachments[0].name;
        
        try {
            console.log(`下载: ${testName}`);
            console.log(`URL: ${testUrl.substring(0, 100)}`);
            
            const response = await fetch(testUrl);
            console.log(`HTTP状态: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const blob = await response.blob();
                console.log(`✅ 下载成功: ${blob.size} 字节`);
                console.log(`文件类型: ${blob.type}`);
                
                // 测试DOCX解析
                if (testName.toLowerCase().endsWith('.docx')) {
                    console.log('\n🔍 开始解析DOCX...');
                    const text = await window.testParseDocx(blob);
                    console.log(`提取文本: ${text.length} 字符`);
                    console.log(`前200字符预览:\n${text.substring(0, 200)}`);
                } else {
                    console.log('⚠️  非DOCX文件，跳过解析测试');
                }
            } else {
                console.log(`❌ 下载失败: HTTP ${response.status}`);
            }
        } catch (e) {
            console.error('❌ 下载或解析出错:', e);
        }
    } else {
        console.log('\n⚠️  跳过第四步：没有可用的URL');
    }
    
    console.log('\n🔧 ==================== 调试完成 ====================');
    console.log('💡 提示：将上述日志截图发送给开发者以获得帮助');
    
    return attachments;
};

// DOCX解析测试函数（简化版）
window.testParseDocx = async function(blob) {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
        
        console.log('  解码后文本长度:', text.length);
        
        // 方法1：提取<w:t>标签
        const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        console.log(`  找到 ${matches.length} 个 <w:t> 标签`);
        
        let content = matches
            .map(m => m.replace(/<[^>]+>/g, '').trim())
            .filter(s => s.length > 0)
            .join('\n');
        
        // 方法2：如果方法1失败，尝试粗暴提取
        if (!content || content.length < 20) {
            console.log('  方法1失败，尝试方法2（粗暴提取）...');
            const rawText = text
                .replace(/<[^>]+>/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/[^\u0020-\u007E\u4E00-\u9FA5\uFF00-\uFFEF]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            const meaningfulSegments = rawText.split(/\s+/)
                .filter(seg => seg.length > 3)
                .join(' ');
            
            if (meaningfulSegments.length > content.length) {
                content = meaningfulSegments;
                console.log(`  方法2成功，提取 ${content.length} 字符`);
            }
        }
        
        return content || '(无法提取任何文本)';
    } catch (e) {
        console.error('  ❌ 解析失败:', e);
        return `(解析异常: ${e.message})`;
    }
};

// 快速检查函数
window.quickCheckAttachments = function() {
    console.log('🔍 快速检查当前页面的附件状态\n');
    
    // 检查附件列表
    const fileItems = document.querySelectorAll('.file-list .file-item');
    console.log(`📎 附件数量: ${fileItems.length}`);
    
    fileItems.forEach((item, idx) => {
        const name = item.querySelector('.file-name')?.textContent?.trim() || '(无名称)';
        const hasPreview = !!item.querySelector('.file-preview, [class*="preview"]');
        console.log(`  ${idx + 1}. ${name} - 预览按钮: ${hasPreview ? '✅' : '❌'}`);
    });
    
    // 检查是否存在iframe（可能已经打开预览）
    const iframes = document.querySelectorAll('iframe');
    if (iframes.length > 0) {
        console.log(`\n📺 检测到 ${iframes.length} 个iframe:`);
        iframes.forEach((iframe, idx) => {
            const src = iframe.src || '(空)';
            console.log(`  iframe${idx + 1}: ${src.substring(0, 80)}`);
        });
    }
    
    console.log('\n💡 运行 debugAttachments() 进行完整测试');
};

console.log('\n📖 附件调试工具已加载');
console.log('使用方法:');
console.log('  - quickCheckAttachments()  快速检查附件状态');
console.log('  - debugAttachments()       完整调试流程');
console.log('');

