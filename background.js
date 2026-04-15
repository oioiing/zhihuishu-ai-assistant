// 智慧树 AI 助教 - 背景脚本（修复版）

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener((details) => {
    console.log('智慧树 AI 助教插件已安装');
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// 处理插件图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ windowId: tab.windowId });
});

// 监听来自侧边栏的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('🔔 收到消息:', request.action, request);

    switch (request.action) {
        case 'ping':
            // 简单的ping响应，用于测试连接
            console.log('📡 Ping请求，发送pong响应');
            sendResponse({ success: true, message: 'pong', timestamp: Date.now() });
            return true;

        case 'callDeepSeekAPI':
            callDeepSeekAPI(request.message)
                .then(response => {
                    sendResponse({ success: true, data: response });
                })
                .catch(error => {
                    console.error('DeepSeek API调用失败:', error);
                    sendResponse({
                        success: false,
                        error: error.message,
                        details: {
                            name: error.name,
                            stack: error.stack,
                            timestamp: Date.now()
                        }
                    });
                });
            return true;

        case 'captureScreen':
            console.log('开始截图请求...');
            captureScreenSimple()
                .then(imageData => {
                    console.log('截图成功，数据长度:', imageData.length);
                    sendResponse({ success: true, data: imageData });
                })
                .catch(error => {
                    console.error('截图失败:', error);
                    sendResponse({
                        success: false,
                        error: error.message || '截图功能暂时不可用，请确保页面已完全加载并重试。'
                    });
                });
            return true;

        case 'analyzeImage':
            analyzeImageWithAI(request.imageData)
                .then(response => {
                    sendResponse({ success: true, data: response });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'analyzeHomeworkText':
            gradeHomeworkWithAI(request.studentAnswer, request.standardAnswer)
                .then(response => {
                    sendResponse({ success: true, data: response });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'analyzeHomework':
            analyzeHomeworkWithAI(request.imageData, request.selectionInfo)
                .then(response => {
                    sendResponse({ success: true, data: response });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'buildKnowledgeGraph':
            // 直接使用当前页面URL构建知识图谱
            buildKnowledgeGraphInBrowser(request.url || 'current_page')
                .then(response => {
                    sendResponse({ success: true, data: response });
                })
                .catch(error => {
                    console.error('知识图谱构建失败:', error);
                    // 提供简化的备用知识图谱
                    const fallbackGraph = createFallbackKnowledgeGraph();
                    sendResponse({ success: true, data: fallbackGraph });
                });
            return true;

        case 'analyzePageContent':
            (async () => {
                try {
                    console.log('🚀 收到分析请求，开始处理...');

                    // 1. 确定要分析的文本
                    let textToAnalyze = request.content;

                    // 如果前端没传内容，后台主动去抓取！
                    if (!textToAnalyze) {
                        console.log('👀 前端未传入内容，后台尝试主动抓取...');
                        const pageData = await extractPageContentInBrowser();
                        textToAnalyze = pageData.content;
                    }

                    // 2. 检查抓取结果
                    if (!textToAnalyze || textToAnalyze.trim().length < 10) {
                        throw new Error("无法抓取到页面内容，或者页面是空的。");
                    }
                    console.log(`📝 准备分析内容长度: ${textToAnalyze.length}`);

                    // 3. 调用 AI 分析
                    const aiResult = await analyzeContentWithDeepSeek(textToAnalyze);

                    // 4. 发送成功结果
                    sendResponse({ success: true, data: aiResult });

                } catch (error) {
                    console.error('❌ 分析流程失败:', error);
                    // 返回具体的错误信息，这样你就知道是哪里挂了，而不是显示默认的英语数据
                    sendResponse({
                        success: false,
                        error: `分析失败: ${error.message}`,
                        // 强制覆盖前端的默认数据，显示错误原因
                        data: {
                            content: `分析出错：${error.message} (请检查 API Key 或网络)`,
                            keywords: [["错误", 1], ["重试", 1]],
                            source: "error"
                        }
                    });
                }
            })();
            return true; // 保持长连接，必须加！

        case 'generateSummary':
            console.log('📄 收到摘要生成请求');
            console.log('📊 页面数据:', {
                title: request.pageData?.title,
                contentLength: request.pageData?.content?.length,
                wordCount: request.pageData?.wordCount
            });

            generatePageSummary(request.pageData)
                .then(summary => {
                    console.log('✅ 摘要生成成功，长度:', summary.length);
                    sendResponse({ success: true, data: summary });
                })
                .catch(error => {
                    console.error('❌ 摘要生成失败:', error);
                    sendResponse({
                        success: false,
                        error: error.message || '摘要生成失败，请稍后重试'
                    });
                });
            return true;
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                if (tabs[0]) {
                    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'No active tab found' });
                }
            });
            return true;

        default:
            sendResponse({ error: 'Unknown action type' });
    }
});

// 简化的屏幕截图函数
async function captureScreenSimple() {
    try {
        console.log('开始截图...');
        const dataUrl = await chrome.tabs.captureVisibleTab(null, {
            format: 'png',
            quality: 90
        });
        console.log('截图成功，数据大小:', dataUrl.length);
        return dataUrl;
    } catch (error) {
        console.error('Screenshot failed:', error);
        if (error.message.includes('Cannot access')) {
            throw new Error('无法访问当前页面进行截图。请确保页面已完全加载，或尝试刷新页面后重试。');
        } else if (error.message.includes('permission')) {
            throw new Error('缺少截图权限。请检查插件权限设置。');
        } else {
            throw new Error(`截图功能暂时不可用: ${error.message}`);
        }
    }
}

// 图像分析函数（增强版本 - 集成OCR和AI分析）
async function analyzeImageWithAI(imageData) {
    try {
        console.log('=== 开始图像分析流程 ===');
        console.log('图片数据长度:', imageData.length);
        console.log('图片格式:', imageData.substring(0, 50));

        // 第一步：使用OCR识别图片中的文字
        const extractedText = await performOCR(imageData);

        if (!extractedText || extractedText.trim().length === 0) {
            return `
📸 **截图分析结果**

❌ **文字识别失败**
未能从图片中识别到文字内容。

**调试信息：**
• 图片大小：${Math.round(imageData.length / 1024)}KB
• 图片格式：${imageData.substring(5, 25)}

**可能的原因：**
• 图片中的文字不够清晰
• 字体过小或模糊
• 背景干扰较多
• OCR服务暂时不可用

**建议操作：**
1. 🔍 确保截图区域包含清晰的文字
2. 📏 放大文字内容后再截图
3. 🖼️ 选择对比度较高的区域截图
            `;
        }

        console.log('OCR识别成功，文字长度:', extractedText.length);
        console.log('识别到的文字预览:', extractedText.substring(0, 100));

        // 第二步：使用AI分析识别出的文字内容
        console.log('开始AI分析...');
        const analysisResult = await analyzeTextContent(extractedText);

        return `
📸 **截图批改分析完成！**

🔍 **识别到的文字内容：**
${extractedText}

---

${analysisResult}
        `;

    } catch (error) {
        console.error('图像分析失败:', error);
        return `
📸 **截图分析遇到问题**

❌ **错误信息：** ${error.message}

**调试信息：**
• 图片大小：${Math.round(imageData.length / 1024)}KB
• 错误类型：${error.name || '未知错误'}

**解决方案：**
1. 📱 重新截图，确保文字清晰可见
2. 🔍 尝试截取更小的区域，专注于文字部分
3. ✍️ 手动输入作业内容进行批改
        `;
    }
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

        // 将base64数据转换为可用格式
        const base64Data = imageData.split(',')[1];

        const formData = new FormData();
        formData.append('base64Image', `data:image/png;base64,${base64Data}`);
        formData.append('apikey', 'helloworld');
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


// 备用OCR识别（多语言支持）
async function performLocalOCR(imageData) {
    try {
        console.log('尝试备用OCR服务...');

        // 尝试使用不同的API endpoint或参数
        const languages = ['chs', 'eng'];

        for (const lang of languages) {
            try {
                const result = await tryAlternativeOCR(imageData, lang);
                if (result && result.trim().length > 0) {
                    return result;
                }
            } catch (error) {
                console.log(`备用OCR ${lang}语言失败:`, error.message);
            }
        }

        throw new Error('所有备用OCR服务都无法识别');

    } catch (error) {
        console.error('备用OCR失败:', error);
        throw new Error('OCR识别失败，请确保图片包含清晰的文字，或手动输入内容进行批改');
    }
}

// 尝试备用OCR服务
async function tryAlternativeOCR(imageData, language = 'chs') {
    try {
        const response = await fetch(imageData);
        const blob = await response.blob();

        const formData = new FormData();
        formData.append('file', blob, 'screenshot.png');
        formData.append('apikey', 'helloworld');
        formData.append('language', language);

        const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData
        });

        if (ocrResponse.ok) {
            const result = await ocrResponse.json();
            if (result.ParsedResults && result.ParsedResults[0]) {
                const text = result.ParsedResults[0].ParsedText;
                if (text && text.trim().length > 0) {
                    return text.trim();
                }
            }
        }

        throw new Error(`备用OCR ${language}语言服务无法识别`);

    } catch (error) {
        console.error(`备用OCR ${language}失败:`, error);
        throw error;
    }
}

// 分析文字内容（使用自定义批改规则）
async function analyzeTextContent(text) {
    const API_KEY = "sk-6f2c1a0e4f6c4274a3abd1754777655b";  // 用户的真实API密钥
    const API_URL = "https://api.deepseek.com/chat/completions";

    try {
        console.log('开始AI分析，文字长度:', text.length);

        // 获取用户自定义的批改规则
        const correctionRules = await new Promise((resolve) => {
            chrome.storage.local.get(['correctionRules'], (result) => {
                resolve(result.correctionRules || {
                    focusAreas: ['语法', '拼写', '标点'],
                    strictness: 'medium',
                    customInstructions: ''
                });
            });
        });

        console.log('📋 使用批改规则:', correctionRules);

        // 根据严格程度设置提示词
        const strictnessPrompts = {
            lenient: '请以鼓励为主，指出主要优点，对小错误给予宽容，提供建设性建议。',
            medium: '请平衡指出优点和需要改进的地方，提供具体的修改建议。',
            strict: '请进行细致的批改，指出所有错误和不足，提供详细的改进方案。'
        };

        const strictnessPrompt = strictnessPrompts[correctionRules.strictness] || strictnessPrompts.medium;

        // 构建批改重点提示
        const focusAreasText = correctionRules.focusAreas.length > 0
            ? `重点关注：${correctionRules.focusAreas.join('、')}`
            : '全面批改';

        // 构建完整的分析提示词
        const analysisPrompt = `
请作为专业的教师，根据以下要求批改作业内容：

【批改要求】
${strictnessPrompt}
${focusAreasText}
${correctionRules.customInstructions ? `\n特殊要求：${correctionRules.customInstructions}` : ''}

【作业内容】
${text}

请按以下格式提供专业批改：

**📝 作业类型识别**
判断这是什么类型的作业（如：英语作文、语法练习、翻译作业、阅读理解等）

**📊 评分建议（满分100分）**
• 内容相关性：_/25分
• 语法准确性：_/25分
• 词汇使用：_/20分
• 文章结构：_/15分
• 拼写标点：_/15分
• **总分：_/100分**

**✅ 优点分析**
指出学生作业中的亮点和优秀之处

**⚠️ 需要改进的地方**
${correctionRules.focusAreas.length > 0 ? `特别关注${correctionRules.focusAreas.join('、')}方面的问题` : '具体指出存在的问题和不足'}

**💡 具体修改建议**
提供详细的修改意见和改进方案

**📚 学习建议**
针对性的学习建议和练习方法
        `;

        const requestBody = {
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content: `你是一位经验丰富的教师，擅长批改各类作业。批改风格：${correctionRules.strictness === 'lenient' ? '鼓励为主' : correctionRules.strictness === 'strict' ? '严格细致' : '平衡指导'}。请提供专业、详细、有建设性的批改建议，使用中文回复。`
                },
                {
                    role: "user",
                    content: analysisPrompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000
        };

        console.log('发送API请求...');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        console.log('API响应状态:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API错误响应:', errorText);
            throw new Error(`API请求失败: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        console.log('API响应成功');

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API响应格式错误');
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error('AI分析失败:', error);

        // 提供更详细的错误信息
        if (error.message.includes('Failed to fetch')) {
            return `**❌ 网络连接失败**

无法连接到AI分析服务，可能的原因：
• 网络连接不稳定
• API服务暂时不可用
• 浏览器阻止了跨域请求

**📝 识别到的文字内容：**
${text}

**💡 建议：**
1. 检查网络连接
2. 稍后重试
3. 或手动分析上述识别的文字内容`;
        } else {
            return `**⚠️ AI分析遇到问题**

错误信息：${error.message}

**📝 识别到的文字内容：**
${text}

**💡 您可以：**
1. 重新尝试截图分析
2. 手动输入作业内容重新分析
3. 直接基于上述识别内容进行教学指导`;
        }
    }
}

// 调用DeepSeek API的函数（修复编码问题）
async function callDeepSeekAPI(message) {
    // DeepSeek API Key - 用户的真实API密钥
    const API_KEY = "sk-6f2c1a0e4f6c4274a3abd1754777655b";  // 用户的真实API密钥
    const API_URL = "https://api.deepseek.com/chat/completions";  // 官方API端点

    // 检查API Key
    if (!API_KEY || API_KEY === "YOUR_NEW_API_KEY_HERE" || API_KEY === "YOUR_REAL_API_KEY_HERE") {
        throw new Error("❌ API密钥未配置\n\n请按以下步骤配置：\n1. 访问 https://platform.deepseek.com\n2. 注册并获取API密钥\n3. 在background_fixed.js中替换API_KEY的值\n4. 确保账户有足够余额");
    }

    console.log('🚀 开始调用DeepSeek API...');
    console.log('📝 消息内容:', message.substring(0, 100) + '...');
    console.log('🔑 API Key状态:', API_KEY ? '已配置' : '未配置');
    console.log('🌐 API URL:', API_URL);

    try {
        const requestBody = {
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content: "You are a professional English teaching assistant. Please provide teaching suggestions and assignment grading advice in Chinese."
                },
                {
                    role: "user",
                    content: message
                }
            ],
            temperature: 0.7,
            max_tokens: 1000,
            stream: false
        };

        console.log('📤 发送请求到:', API_URL);
        console.log('📊 请求体大小:', JSON.stringify(requestBody).length, 'bytes');
        console.log('🔧 请求配置:', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY.substring(0, 10)}...`,
                'User-Agent': 'ZhihuishuAI/1.0.0'
            }
        });

        const startTime = Date.now();
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'User-Agent': 'ZhihuishuAI/1.0.0'
            },
            body: JSON.stringify(requestBody)
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        console.log('📥 API响应状态:', response.status, response.statusText);
        console.log('⏱️ 响应时间:', responseTime, 'ms');
        console.log('📋 响应头:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API错误响应内容:', errorText);

            // 根据状态码提供更具体的错误信息
            let errorMessage = `API请求失败 (${response.status})`;
            let solution = '';

            if (response.status === 401) {
                errorMessage = '🔑 API密钥认证失败';
                solution = `
可能原因：
• API密钥无效或格式错误
• API密钥已过期
• 账户被暂停或限制

解决方案：
1. 检查API密钥是否正确（应以sk-开头）
2. 登录DeepSeek平台检查密钥状态
3. 重新生成新的API密钥
4. 确认账户状态正常`;
            } else if (response.status === 429) {
                errorMessage = '⚠️ API调用频率过高';
                solution = `
解决方案：
1. 等待1-2分钟后重试
2. 减少API调用频率
3. 检查是否有其他程序在使用同一密钥`;
            } else if (response.status === 403) {
                errorMessage = '🚫 API访问被拒绝';
                solution = `
可能原因：
• 账户余额不足
• API密钥权限不足
• 服务被限制

解决方案：
1. 检查账户余额并充值
2. 确认API密钥权限设置
3. 联系DeepSeek客服`;
            } else if (response.status >= 500) {
                errorMessage = '🔧 DeepSeek服务器错误';
                solution = `
解决方案：
1. 稍后重试（服务器临时故障）
2. 检查DeepSeek服务状态页面
3. 如持续出现，联系技术支持`;
            } else if (response.status === 400) {
                errorMessage = '📝 请求参数错误';
                solution = `
解决方案：
1. 检查输入内容格式
2. 确认消息长度不超过限制
3. 检查模型名称是否正确`;
            }

            throw new Error(`${errorMessage}\n\n${solution}\n\n详细错误信息: ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ API响应成功，数据大小:', JSON.stringify(data).length, 'bytes');
        console.log('📊 响应数据结构:', {
            choices: data.choices ? data.choices.length : 0,
            usage: data.usage || 'N/A',
            model: data.model || 'N/A'
        });

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('❌ API响应格式异常:', data);
            throw new Error('API响应格式错误，未找到有效内容\n\n可能原因：\n• 服务器返回了异常格式\n• 模型输出被过滤\n• 网络传输中断\n\n建议重试或联系技术支持');
        }

        const result = data.choices[0].message.content;
        console.log('🎉 API调用成功，返回内容长度:', result.length);

        return result;

    } catch (error) {
        console.error('💥 DeepSeek API调用详细错误:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // 网络连接错误的特殊处理
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error(`🌐 网络连接失败

可能原因：
• 网络连接不稳定或中断
• 防火墙阻止了API请求
• DNS解析失败
• 需要代理访问（中国大陆用户）

解决方案：
1. 检查网络连接状态
2. 尝试刷新页面重试
3. 检查防火墙和安全软件设置
4. 如在中国大陆，可能需要稳定的网络环境
5. 联系网络管理员或ISP

技术详情: ${error.message}`);
        } else if (error.message.includes('CORS')) {
            throw new Error('🔒 跨域请求被阻止\n\n这是浏览器安全限制，通常不应该发生。\n请尝试刷新页面或重新安装插件。');
        } else if (error.message.includes('timeout')) {
            throw new Error('⏰ 请求超时\n\n网络响应过慢，请检查网络连接或稍后重试。');
        } else {
            // 重新抛出原始错误，保持错误信息完整
            throw error;
        }
    }
}

// 处理标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.includes('zhihuishu.com')) {
            console.log('Detected Zhihuishu website, enhanced features available');
        }
    }
});

// 浏览器内知识图谱构建
async function buildKnowledgeGraphInBrowser(url) {
    try {
        console.log('开始在浏览器中构建知识图谱，URL:', url);

        // 获取页面内容（包括图片）
        const pageContent = await extractPageContentInBrowser();

        if (!pageContent) {
            throw new Error('无法获取页面内容');
        }

        console.log('页面内容提取成功:', {
            title: pageContent.title,
            contentLength: pageContent.content.length,
            imageCount: pageContent.images ? pageContent.images.length : 0
        });

        let allContent = pageContent.content;

        // 如果有图片，进行OCR识别并加入内容
        if (pageContent.images && pageContent.images.length > 0) {
            console.log(`发现${pageContent.images.length}张图片，开始OCR识别...`);

            for (const image of pageContent.images) {
                if (image.dataURL) {
                    try {
                        const imageText = await performOCR(image.dataURL);
                        if (imageText && imageText.trim().length > 0) {
                            console.log(`图片OCR识别成功，文字长度: ${imageText.length}`);
                            allContent += `\n\n[图片内容]\n${imageText}`;
                        }
                    } catch (ocrError) {
                        console.log(`图片OCR识别失败: ${ocrError.message}`);
                        if (image.alt && image.alt.trim().length > 0) {
                            allContent += `\n\n[图片描述: ${image.alt}]`;
                        }
                    }
                }
            }
        }

        // 基于完整内容（文本+图片）构建知识图谱
        const enhancedPageContent = {
            title: pageContent.title,
            content: allContent,
            url: pageContent.url
        };

        console.log('开始构建知识图谱，总内容长度:', allContent.length);
        const graphData = buildKnowledgeGraphFromContent(enhancedPageContent);

        console.log('知识图谱构建成功:', {
            nodeCount: graphData.nodes.length,
            edgeCount: graphData.edges.length,
            title: graphData.metadata.title
        });

        return graphData;

    } catch (error) {
        console.error('构建知识图谱失败:', error);
        throw error;
    }
}

// 浏览器内页面内容分析
async function analyzePageContentInBrowser(url) {
    try {
        console.log('开始在浏览器中分析页面内容，URL:', url);

        // 获取页面内容（包括图片）
        const pageContent = await extractPageContentInBrowser();

        if (!pageContent) {
            throw new Error('无法获取页面内容');
        }

        let allContent = pageContent.content;
        const imageTexts = [];

        // 如果有图片，进行OCR识别
        if (pageContent.images && pageContent.images.length > 0) {
            console.log(`发现${pageContent.images.length}张图片，开始OCR识别...`);

            for (const image of pageContent.images) {
                if (image.dataURL) {
                    try {
                        // 使用现有的OCR功能识别图片中的文字
                        const imageText = await performOCR(image.dataURL);
                        if (imageText && imageText.trim().length > 0) {
                            imageTexts.push({
                                src: image.src,
                                alt: image.alt,
                                text: imageText,
                                width: image.width,
                                height: image.height
                            });

                            // 将图片文字加入总内容
                            allContent += `\n\n[图片内容: ${image.alt || '图片'}]\n${imageText}`;
                        }
                    } catch (ocrError) {
                        console.log(`图片OCR识别失败: ${ocrError.message}`);
                        // 如果OCR失败，使用alt文本
                        if (image.alt && image.alt.trim().length > 0) {
                            allContent += `\n\n[图片描述: ${image.alt}]`;
                        }
                    }
                }
            }
        }

        // 分析关键词（基于文本+图片内容）
        const keywords = extractKeywordsFromText(allContent);

        // 生成摘要
        const summary = generateSummary(allContent);

        const result = {
            title: pageContent.title,
            content: summary,
            keywords: keywords,
            images: imageTexts,
            url: url
        };

        console.log('页面内容分析成功，包含图片识别结果');
        return result;

    } catch (error) {
        console.error('分析页面内容失败:', error);
        throw error;
    }
}

// 在浏览器中提取页面内容
async function extractPageContentInBrowser() {
    try {
        // 获取当前活动标签页
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];

        if (!activeTab) {
            throw new Error('无法获取当前标签页');
        }

        // 检查是否是特殊页面（chrome://、extension://等）
        if (activeTab.url.startsWith('chrome://') ||
            activeTab.url.startsWith('chrome-extension://') ||
            activeTab.url.startsWith('edge://') ||
            activeTab.url.startsWith('about:')) {
            throw new Error('无法分析浏览器内部页面，请在普通网页上使用此功能');
        }

        try {
            // 尝试注入内容脚本来提取页面内容
            const results = await chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                function: extractContentFromPage
            });

            if (results && results[0] && results[0].result) {
                return results[0].result;
            } else {
                throw new Error('内容脚本执行失败');
            }

        } catch (scriptError) {
            console.log('脚本注入失败，尝试备用方案:', scriptError);

            // 备用方案：使用标签页信息
            return {
                title: activeTab.title || '未知页面',
                content: `页面标题：${activeTab.title}\n\n由于页面安全限制，无法直接提取内容。建议：\n1. 刷新页面后重试\n2. 确保页面完全加载\n3. 在普通网页（非特殊页面）上使用此功能`,
                url: activeTab.url
            };
        }

    } catch (error) {
        console.error('提取页面内容失败:', error);
        throw error;
    }
}

// 提取页面内容提取函数 (增强清洗版)
function extractContentFromPage() {
    try {
        console.log('🧹 开始提取并清洗页面内容...');

        // 1. 克隆 Body 防止破坏原页面
        const clonedBody = document.body.cloneNode(true);

        // 2. 垃圾元素黑名单 (关键步骤！)
        // 这里的类名涵盖了大部分网站的 导航、侧边栏、弹窗、按钮、页脚
        const junkSelectors = [
            'script', 'style', 'noscript', 'iframe', 'svg',
            'nav', 'header', 'footer',
            '.nav', '.navbar', '.header', '.footer', '.bottom',
            '.sidebar', '.side-bar', '.aside', // 侧边栏
            '.menu', '.breadcrumb', // 菜单和面包屑
            '.btn', 'button', '.button', // 按钮 (去掉"去学习"这种词)
            '.ad', '.advertisement', '.promo', // 广告
            '.popup', '.modal', '.overlay', // 弹窗
            '.copyright', '.icp', // 版权信息
            '[role="button"]', '[role="navigation"]',
            '.ai-helper', '.tool-bar' // 针对你截图里的 AI 悬浮球
        ];

        // 移除所有垃圾元素
        junkSelectors.forEach(selector => {
            const elements = clonedBody.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        });

        // 3. 提取主要文本
        // 优先找 <main> 或 .content，如果找不到才用 body
        let mainText = '';
        const contentSelectors = ['main', 'article', '#content', '.course-detail', '.main-content'];

        for (const selector of contentSelectors) {
            const el = clonedBody.querySelector(selector);
            if (el) {
                mainText = el.innerText;
                console.log(`🎯 命中主要内容区域: ${selector}`);
                break;
            }
        }

        // 如果没找到特定区域，就用清洗过的 body
        if (!mainText) {
            mainText = clonedBody.innerText;
        }

        // 4. 文本清洗
        return {
            title: document.title,
            // 去除多余空格空行，截取前 5000 字（避免 Token 溢出）
            content: mainText.replace(/\s+/g, ' ').trim().substring(0, 5000),
            url: window.location.href
        };

    } catch (error) {
        console.error('内容提取失败:', error);
        return { title: '', content: '' };
    }
}


// 提取页面图片信息
function extractPageImages() {
    const images = [];

    try {
        // 获取页面中的所有图片
        const imgElements = document.querySelectorAll('img');

        for (let i = 0; i < Math.min(imgElements.length, 5); i++) { // 最多处理5张图片
            const img = imgElements[i];

            // 过滤掉太小的图片（可能是装饰性图片）
            if (img.width < 50 || img.height < 50) continue;

            // 过滤掉明显的装饰性图片
            const src = img.src || '';
            const alt = img.alt || '';
            const className = img.className || '';

            if (src.includes('logo') || src.includes('icon') ||
                className.includes('logo') || className.includes('icon') ||
                alt.includes('logo') || alt.includes('icon')) {
                continue;
            }

            // 尝试将图片转换为base64
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // 设置合适的尺寸
                const maxSize = 400;
                let { width, height } = img;

                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width *= ratio;
                    height *= ratio;
                }

                canvas.width = width;
                canvas.height = height;

                // 绘制图片到canvas
                ctx.drawImage(img, 0, 0, width, height);

                // 转换为base64
                const dataURL = canvas.toDataURL('image/jpeg', 0.7);

                images.push({
                    src: img.src,
                    alt: alt,
                    dataURL: dataURL,
                    width: img.width,
                    height: img.height
                });

            } catch (canvasError) {
                // 如果canvas转换失败，只记录图片信息
                images.push({
                    src: img.src,
                    alt: alt,
                    dataURL: null,
                    width: img.width,
                    height: img.height
                });
            }
        }

    } catch (error) {
        console.error('图片提取失败:', error);
    }

    return images;
}

// 从文本中提取关键词
function extractKeywordsFromText(text) {
    if (!text || text.length === 0) {
        return [];
    }

    // 教育领域关键词库
    const educationKeywords = [
        '数学', '英语', '语文', '物理', '化学', '生物', '历史', '地理', '政治',
        '计算机', '编程', '算法', '数据结构', '机器学习', '人工智能',
        '教学', '学习', '课程', '作业', '考试', '知识点', '概念', '定理',
        '公式', '方法', '技巧', '练习', '题目', '答案', '解析', '语法',
        '词汇', '阅读', '写作', '听力', '口语', '翻译', '文学', '诗歌',
        'grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking',
        'mathematics', 'physics', 'chemistry', 'biology', 'history', 'geography'
    ];

    // 简单的关键词提取
    const words = text.toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')  // 保留中英文和数字
        .split(/\s+/)
        .filter(word => word.length > 1);

    // 统计词频
    const wordCount = {};
    words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
    });

    // 过滤教育相关关键词并计算权重
    const keywords = [];

    for (const [word, count] of Object.entries(wordCount)) {
        // 检查是否为教育相关词汇
        const isEducationWord = educationKeywords.some(eduWord =>
            word.includes(eduWord.toLowerCase()) || eduWord.toLowerCase().includes(word)
        );

        if (isEducationWord || count >= 3) {  // 教育词汇或高频词
            const weight = count / words.length;  // 计算权重
            keywords.push([word, weight]);
        }
    }

    // 按权重排序并返回前20个
    return keywords
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
}

// 生成内容摘要
function generateSummary(text, maxLength = 500) {
    if (!text || text.length <= maxLength) {
        return text;
    }

    // 按句子分割
    const sentences = text.split(/[。！？.!?]/).filter(s => s.trim().length > 0);

    if (sentences.length <= 3) {
        return text.substring(0, maxLength) + '...';
    }

    // 选择前几个句子作为摘要
    let summary = '';
    for (const sentence of sentences) {
        if (summary.length + sentence.length > maxLength) {
            break;
        }
        summary += sentence.trim() + '。';
    }

    return summary || text.substring(0, maxLength) + '...';
}

// 从内容构建知识图谱
function buildKnowledgeGraphFromContent(pageContent) {
    const { title, content, url } = pageContent;

    // 提取关键词
    const keywords = extractKeywordsFromText(content);

    // 提取实体（简化版）
    const entities = extractEntitiesFromText(content);

    // 构建图谱数据
    const graphData = {
        nodes: [],
        edges: [],
        metadata: {
            title: title,
            url: url,
            total_keywords: keywords.length,
            total_entities: entities.length
        }
    };

    // 添加页面节点
    graphData.nodes.push({
        id: 'page',
        label: title.length > 30 ? title.substring(0, 30) + '...' : title,
        type: 'page',
        size: 30,
        color: '#3b82f6'
    });

    // 添加关键词节点
    keywords.slice(0, 10).forEach((keyword, i) => {
        const [word, weight] = keyword;
        graphData.nodes.push({
            id: `keyword_${i}`,
            label: word,
            type: 'keyword',
            size: Math.max(10, Math.min(25, weight * 1000)),
            color: '#10b981',
            weight: weight
        });

        // 添加页面到关键词的边
        graphData.edges.push({
            source: 'page',
            target: `keyword_${i}`,
            type: 'contains',
            weight: weight
        });
    });

    // 添加实体节点
    entities.slice(0, 8).forEach((entity, i) => {
        graphData.nodes.push({
            id: `entity_${i}`,
            label: entity.name,
            type: entity.type,
            size: 15,
            color: '#8b5cf6',
            context: entity.context
        });

        // 添加页面到实体的边
        graphData.edges.push({
            source: 'page',
            target: `entity_${i}`,
            type: 'defines',
            label: entity.type
        });
    });

    return graphData;
}

// 从文本中提取实体
function extractEntitiesFromText(text) {
    const entities = [];

    // 简单的实体识别规则
    const patterns = {
        '概念': /([^\s，。！？；：]{2,10})(概念|定义|含义|是指)/g,
        '公式': /([^\s，。！？；：]{2,10})(公式|方程|等式)/g,
        '定理': /([^\s，。！？；：]{2,10})(定理|定律|原理)/g,
        '方法': /([^\s，。！？；：]{2,10})(方法|技巧|策略|步骤)/g,
        '知识点': /([^\s，。！？；：]{2,10})(知识点|要点|重点)/g
    };

    for (const [entityType, pattern] of Object.entries(patterns)) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const entityName = match[1].trim();
            if (entityName.length > 1 && entityName.length < 15) {
                entities.push({
                    name: entityName,
                    type: entityType,
                    context: match[0]
                });
            }
        }
    }

    return entities;
}

// 错误处理
chrome.runtime.onSuspend.addListener(() => {
    console.log('Extension is about to be suspended');
});

chrome.runtime.onStartup.addListener(() => {
    console.log('Browser startup, extension reactivated');
});
// 创建备用知识图谱（当主要方法失败时使用）
function createFallbackKnowledgeGraph() {
    console.log('创建备用知识图谱...');

    return {
        nodes: [
            { id: 'page', label: '当前页面', type: 'page', size: 30, color: '#3b82f6' },
            { id: 'keyword_0', label: '英语', type: 'keyword', size: 20, color: '#10b981', weight: 0.8 },
            { id: 'keyword_1', label: '语法', type: 'keyword', size: 18, color: '#10b981', weight: 0.7 },
            { id: 'keyword_2', label: '学习', type: 'keyword', size: 16, color: '#10b981', weight: 0.6 },
            { id: 'keyword_3', label: '教学', type: 'keyword', size: 15, color: '#10b981', weight: 0.5 },
            { id: 'entity_0', label: '现在完成时', type: '概念', size: 15, color: '#8b5cf6' },
            { id: 'entity_1', label: '语法规则', type: '方法', size: 15, color: '#8b5cf6' }
        ],
        edges: [
            { source: 'page', target: 'keyword_0', type: 'contains', weight: 0.8 },
            { source: 'page', target: 'keyword_1', type: 'contains', weight: 0.7 },
            { source: 'page', target: 'keyword_2', type: 'contains', weight: 0.6 },
            { source: 'page', target: 'keyword_3', type: 'contains', weight: 0.5 },
            { source: 'page', target: 'entity_0', type: 'defines', label: '概念' },
            { source: 'page', target: 'entity_1', type: 'defines', label: '方法' }
        ],
        metadata: {
            title: '页面知识图谱',
            url: 'current_page',
            total_keywords: 4,
            total_entities: 2
        }
    };
}

// ==========================================
// 1. 生成页面摘要 (Markdown 格式，用于 Chat)
// ==========================================
async function generatePageSummary(pageData) {
    // 你的 DeepSeek API Key
    const API_KEY = "sk-6f2c1a0e4f6c4274a3abd1754777655b";
    const API_URL = "https://api.deepseek.com/chat/completions";

    try {
        console.log('🤖 [Summary] 开始生成结构化课程分析...');

        // 简单的数据清洗
        let content = pageData.content || "";
        if (content.length > 8000) content = content.substring(0, 8000) + '...';

        const summaryPrompt = `
你是一位专业的"大学课程规划顾问"。
请根据网页内容，输出一份结构清晰、通过 Markdown 渲染的【课程分析报告】。

网页标题：${pageData.title}
网页内容：
${content}

🔴 **分析要求**：
1. 忽略导航栏、版权、广告等噪音。
2. 使用 Markdown 格式：
   # 🎓 [课程名称]
   ### 1. 📋 课程档案
   - **教师**：...
   - **学分**：...
   ### 2. 💡 核心内容
   (一句话总结)
   ### 3. 🌟 知识图谱
   (3-5个核心模块)
   ### 4. ⚠️ 学习攻略
   (难点预警)
`;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "你是一个善于提取核心信息的AI助教。" },
                    { role: "user", content: summaryPrompt }
                ],
                temperature: 0.4
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0]) throw new Error('API 响应格式错误');

        return data.choices[0].message.content;

    } catch (error) {
        console.error('Summary 生成失败:', error);
        return `### ⚠️ 分析失败\n\n原因：${error.message}`;
    }
}


// ==========================================
// 2. 深度页面分析 (JSON 格式，用于蓝色胶囊标签)
// ==========================================
async function analyzeContentWithDeepSeek(rawContent) {
    // 🔴 记得替换你的 API Key
    const API_KEY = "sk-6f2c1a0e4f6c4274a3abd1754777655b";
    const API_URL = "https://api.deepseek.com/chat/completions";

    const prompt = `
你是一个专业的课程内容分析师。请分析以下网页文本。

文本内容：
${rawContent.substring(0, 3000)}

🔴 **必须严格只返回 JSON 对象** (不要 markdown 代码块)：
{
    "content": "这里写一段通俗易懂的课程简介（约100字），不要包含导航栏里的废话。",
    "keywords": [
        ["核心概念1", 0.9],
        ["核心概念2", 0.8],
        ["核心概念3", 0.7],
        ["核心概念4", 0.6],
        ["核心概念5", 0.5]
    ]
}
`;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        const content = data.choices[0].message.content;

        // 清洗可能存在的 Markdown 标记
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(jsonStr);

        result.source = 'ai_deep_analysis';
        return result;

    } catch (error) {
        console.error("Analysis 失败:", error);
        // 如果出错，返回一个显眼的错误信息，而不是默认的英语内容
        return {
            content: "AI 分析连接失败，请检查 API Key。",
            keywords: [["连接失败", 1.0], ["请检查Key", 0.9]],
            source: 'error'
        };
    }
}

async function gradeHomeworkWithAI(studentAnswer, standardAnswer) {
    const API_KEY = "sk-6f2c1a0e4f6c4274a3abd1754777655b";
    const API_URL = "https://api.deepseek.com/chat/completions";

    const prompt = `
你是一位专业的教师。请根据标准答案（如果有）对学生的作业进行批改。

【标准答案】
${standardAnswer || '未提供标准答案，请根据题目内容进行专业评价。'}

【学生答案】
${studentAnswer}

🔴 **必须严格只返回 JSON 对象**：
{
    "score": 85,
    "feedback": "总体评价，指出优点和不足。",
    "details": "详细的批改细节，例如：第1题正确，第2题拼写错误等。",
    "improvement": "具体的改进方案和学习建议。"
}
`;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
    } catch (error) {
        console.error("Grading 失败:", error);
        throw error;
    }
}