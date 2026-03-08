// 智能作业阅卷助手 - 前端脚本
// 注意：content-utils.js 应该在本文件之前加载

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

    // ========== 配置常量 ==========
    const OCR_TIMEOUT_MS = 15000;          // OCR 识别超时（毫秒）
    const OCR_MAX_RETRIES = 2;             // OCR 失败后最大重试次数
    const PREVIEW_CACHE_MAX_ITEMS = 30;    // Preview 共享缓存最大保留条数
    const CONFIRM_POLL_INTERVAL_MS = 200;  // 确认弹窗轮询间隔（毫秒）
    const CONFIRM_MAX_ATTEMPTS = 25;       // 确认弹窗最大轮询次数（25 × 200ms = 5秒）

    // ========== 工具函数 ==========
    function decodeBase64Param(param) {
        const decoded = decodeURIComponent(param);
        const padded = decoded + '='.repeat((4 - decoded.length % 4) % 4);
        return atob(padded);
    }

    // ========== window.open拦截 - 捕获文件预览URL（避免打开新标签页）==========
    (() => {
        const originalOpen = window.open;
        window._zhsInterceptedPreviewUrls = window._zhsInterceptedPreviewUrls || [];
        
        window.open = function(url, ...args) {
            console.info(`🔗 [window.open拦截] 捕获到URL: ${url}`);
            
            // 记录所有preview相关URL
            if (url && typeof url === 'string' && 
                (url.includes('resource/preview') || 
                 url.includes('resource/onlinePreview') ||
                 url.includes('resource/getCorsFile'))) {
                
                window._zhsInterceptedPreviewUrls.push({
                    previewUrl: url,
                    timestamp: Date.now()
                });
                
                console.info(`📎 [window.open拦截] 记录预览URL（共${window._zhsInterceptedPreviewUrls.length}个）`);
                console.info(`   Preview URL: ${url.substring(0, 120)}`);
                
                // 尝试解码Base64参数获取真实文件URL
                try {
                    const urlObj = new URL(url);
                    const uParam = urlObj.searchParams.get('u') || urlObj.searchParams.get('urlPath');
                    if (uParam) {
                        const realUrl = decodeBase64Param(uParam);
                        console.info(`🔓 [window.open拦截] 解码出真实URL: ${realUrl}`);
                        
                        // 记录解码后的URL
                        window._zhsInterceptedPreviewUrls[window._zhsInterceptedPreviewUrls.length - 1].decodedUrl = realUrl;
                    }
                } catch (e) {
                    console.warn(`⚠️ [window.open拦截] URL解码失败: ${e.message}`);
                }
                
                // 🚫 阻止打开新标签页：返回一个mock window对象，避免用户看到新标签页弹出
                console.info(`🚫 [window.open拦截] 已阻止打开新标签页（已提取URL）`);
                return {
                    closed: false,
                    close: () => {},
                    focus: () => {},
                    blur: () => {},
                    postMessage: () => {}
                };
            }
            
            // 非preview URL，正常打开
            return originalOpen.apply(this, [url, ...args]);
        };
        
        console.info('✅ [window.open拦截] 已启动，将捕获所有window.open调用（preview类URL不会打开新标签）');
    })();

    // ========== 阻止附件链接打开新标签页 ==========
    (() => {
        document.addEventListener('click', (e) => {
            // 查找点击的<a>标签
            let target = e.target;
            while (target && target.tagName !== 'A' && target !== document.body) {
                target = target.parentElement;
            }
            
            if (target && target.tagName === 'A') {
                const href = target.getAttribute('href') || '';
                const targetAttr = target.getAttribute('target') || '';
                
                // 如果是预览链接且设置了target="_blank"，阻止打开新标签页
                if (targetAttr === '_blank' && 
                    (href.includes('resource/preview') || 
                     href.includes('resource/onlinePreview') ||
                     href.includes('polymas.com'))) {
                    console.info(`🚫 [链接拦截] 阻止打开新标签页: ${href.substring(0, 80)}...`);
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // 改为在当前页面打开（如果需要的话可以注释掉这行，完全阻止跳转）
                    // window.location.href = href;
                }
            }
        }, true);  // 使用捕获阶段，优先拦截
        
        console.info('✅ [链接拦截] 已启动，将阻止预览链接打开新标签页');
    })();

    // ========== Preview页面检测 - 提取文件URL ==========
    (() => {
        const currentUrl = window.location.href;
        
        // 检测是否为preview页面
        if (currentUrl.includes('/resource/preview')) {
            appLogger.info('🎯 [Preview页面] 检测到预览页面，准备提取文件URL...');
            
            try {
                const urlObj = new URL(currentUrl);
                const uParam = urlObj.searchParams.get('u');
                const nParam = urlObj.searchParams.get('n');
                
                if (uParam) {
                    // 解码文件URL
                    const fileUrl = decodeBase64Param(uParam);
                    
                    appLogger.info('✅ [Preview页面] 成功提取文件URL:', fileUrl);
                    
                    // 解码文件名（可选）
                    let fileName = 'unknown.docx';
                    if (nParam) {
                        try {
                            fileName = decodeBase64Param(nParam);
                            appLogger.info('✅ [Preview页面] 文件名:', fileName);
                        } catch (e) {
                            appLogger.warn('⚠️ [Preview页面] 文件名解码失败:', e.message);
                        }
                    }
                    
                    // ========== 分析DOCX内容函数 ==========
                    const analyzeDocxContent = (rawContent) => {
                        appLogger.info('🔍 [Preview页面] 开始分析DOCX内容...');
                        
                        // 清理和规范化文本
                        const cleanText = (text) => {
                            return text
                                .replace(/\r\n/g, '\n')
                                .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 移除零宽字符
                                .trim();
                        };
                        
                        const content = cleanText(rawContent);

                        // 对“扁平化”文本做一次结构恢复：题号、选项、答案标签前主动断行
                        const normalizeForParsing = (text) => {
                            return text
                                .replace(/\u00A0/g, ' ')
                                .replace(/\s+(答案|参考答案|标准答案|Answer|Answers)\b/gi, '\n$1')
                                .replace(/\s+([\d]{1,2}[\.\)）])/g, '\n$1')
                                .replace(/\s+([一二三四五六七八九十]+[\.\)）])/g, '\n$1')
                                .replace(/([?？])\s*([A-Da-d][\.\)）:：])/g, '$1\n$2')
                                .replace(/\s+([A-Da-d][\.\)）:：])/g, '\n$1')
                                .replace(/\n{3,}/g, '\n\n')
                                .trim();
                        };

                        const normalizedContent = normalizeForParsing(content);
                        const lines = normalizedContent.split('\n').filter(line => line.trim());
                        
                        // 识别题目和答案
                        const analysis = {
                            fileName: fileName,
                            fileUrl: fileUrl,
                            rawContent: content,
                            contentLength: content.length,
                            lineCount: lines.length,
                            questions: [],
                            answers: [],
                            answerExplanations: [],
                            keyPoints: [],
                            structure: {
                                hasTitle: false,
                                hasQuestions: false,
                                hasAnswers: false
                            }
                        };
                        
                        // 识别标题（通常是第一行或很短的行）
                        if (lines.length > 0) {
                            const firstLine = lines[0];
                            if (firstLine.length < 100 && (firstLine.includes('题') || firstLine.includes('考') || firstLine.includes('练') || firstLine.includes('作业'))) {
                                analysis.structure.hasTitle = true;
                                analysis.title = firstLine;
                            }
                        }
                        
                        // 识别题目和答案区块
                        let currentQuestion = '';
                        let currentAnswer = '';
                        let inAnswerSection = false;
                        let answerSectionStart = -1;
                        
                        // 第一步：找到答案区块的开始位置
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (line.match(/^(答案|参考答案|标准答案|Answer|ANSWER)$/i)) {
                                answerSectionStart = i;
                                break;
                            }
                        }
                        
                        // 包裹多行内容的逻辑
                        const wrapContent = (text) => {
                            if (!text) return '';
                            // 移除多余的空格但保留结构
                            return text.trim().replace(/\s+/g, ' ');
                        };
                        
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (!line) continue;
                            
                            if (i === answerSectionStart) {
                                inAnswerSection = true;
                                analysis.structure.hasAnswers = true;
                                if (currentQuestion) {
                                    analysis.questions.push(wrapContent(currentQuestion));
                                    currentQuestion = '';
                                }
                                continue;
                            }
                            
                            if (inAnswerSection) {
                                // 在答案区块中
                                if (/^[\d一二三四五六七八九十百千万亿]+[\.\)）、：:]/.test(line)) {
                                    // 新的答案项目
                                    if (currentAnswer) {
                                        const answerObj = separateAnswerAndExplanation(currentAnswer);
                                        analysis.answers.push(answerObj.answer);
                                        if (answerObj.explanation) {
                                            analysis.answerExplanations.push(answerObj.explanation);
                                        }
                                    }
                                    currentAnswer = line;
                                } else if (currentAnswer || line.length > 5) {
                                    // 继续当前答案（多行）
                                    if (currentAnswer) {
                                        currentAnswer += ' ' + line;
                                    }
                                }
                            } else {
                                // 在题目区块中
                                if (/^[\d一二三四五六七八九十百千万亿]+[\.\)）、：:]/.test(line)) {
                                    // 新的题目项目
                                    if (currentQuestion) {
                                        analysis.questions.push(wrapContent(currentQuestion));
                                    }
                                    analysis.structure.hasQuestions = true;
                                    currentQuestion = line;
                                } else if (currentQuestion) {
                                    // 继续当前题目（包括选项）
                                    if (line.match(/^[A-Da-d][\.\)）：]/)) {
                                        // 这是一个选项
                                        currentQuestion += ' ' + line;
                                    } else {
                                        // 题目的继续或其他内容
                                        currentQuestion += ' ' + line;
                                    }
                                }
                            }
                        }

                        // 保存最后的内容
                        if (currentQuestion) {
                            analysis.questions.push(wrapContent(currentQuestion));
                        }
                        if (currentAnswer) {
                            const answerObj = separateAnswerAndExplanation(currentAnswer);
                            analysis.answers.push(answerObj.answer);
                            if (answerObj.explanation) {
                                analysis.answerExplanations.push(answerObj.explanation);
                            }
                        }

                        // 辅助函数：分离答案和解析
                        function separateAnswerAndExplanation(answerText) {
                            const text = answerText.trim();

                            // 寻找解析关键词
                            const explanationKeywords = ['解释', '解析', '因为', '所以', 'because', 'Explanation', '理由', 'reason'];

                            for (const keyword of explanationKeywords) {
                                const idx = text.indexOf(keyword);
                                if (idx > 10) {
                                    return {
                                        answer: text.substring(0, idx).trim(),
                                        explanation: text.substring(idx).trim()
                                    };
                                }
                            }

                            // 如果没有找到关键词，检查是否有很长的文本（可能包含解析）
                            if (text.length > 200) {
                                const thirdPoint = Math.floor(text.length / 3);
                                return {
                                    answer: text.substring(0, thirdPoint).trim(),
                                    explanation: text.substring(thirdPoint).trim()
                                };
                            }

                            return { answer: text, explanation: null };
                        }
                        
                        // 兜底：如果仍然只识别到 0/1 题，尝试按“题号块”从整段文本二次切分
                        if (analysis.questions.length <= 1) {
                            const questionBlockRegex = /(?:^|\n)\s*([\d一二三四五六七八九十]+[\.\)）][\s\S]*?)(?=\n\s*[\d一二三四五六七八九十]+[\.\)）]|\n\s*(?:答案|参考答案|标准答案|Answer|Answers)\b|$)/g;
                            const fallbackMatches = [...normalizedContent.matchAll(questionBlockRegex)]
                                .map((m) => (m[1] || '').trim())
                                .filter(Boolean);

                            if (fallbackMatches.length > analysis.questions.length) {
                                analysis.questions = fallbackMatches.map((q) => wrapContent(q));
                                analysis.structure.hasQuestions = analysis.questions.length > 0;
                                appLogger.info(`📌 [Preview页面] 启用题号块兜底切分，题目数: ${analysis.questions.length}`);
                            }
                        }

                        // 提取关键点（较长的段落）
                        analysis.keyPoints = lines
                            .filter(line => line.length > 30 && line.length < 200)
                            .slice(0, 10);
                        
                        appLogger.info('✅ [Preview页面] 内容分析完成:', {
                            contentLength: analysis.contentLength,
                            hasTitle: analysis.structure.hasTitle,
                            hasQuestions: analysis.structure.hasQuestions,
                            questionCount: analysis.questions.length,
                            hasAnswers: analysis.structure.hasAnswers,
                            answerCount: analysis.answers.length,
                            explanationCount: analysis.answerExplanations.length
                        });
                        
                        return analysis;
                    };
                    
                    // 将文件URL发送给background进行下载和解析
                    appLogger.info('📤 [Preview页面] 发送文件URL给background...');
                    chrome.runtime.sendMessage({
                        action: 'downloadAndParseAttachment',
                        fileUrl: fileUrl,
                        fileName: fileName
                    }, async (response) => {
                        if (chrome.runtime.lastError) {
                            appLogger.error('❌ [Preview页面] 发送失败:', chrome.runtime.lastError.message);
                        } else if (response && response.success) {
                            appLogger.info('✅ [Preview页面] 文件处理成功:', {
                                fileName: response.fileName,
                                contentLength: response.content?.length || 0
                            });
                            
                            // 分析内容：优先使用 onlinePreview 的 PDF 文本，其次才用 DOCX 解析结果
                            const docxContent = response.content || '';
                            const docxAnalysis = analyzeDocxContent(docxContent);

                            const calculateAnalysisQuality = (analysisObj, text) => {
                                const safeText = String(text || '');
                                const questionCount = Number(analysisObj?.questions?.length || 0);
                                const answerCount = Number(analysisObj?.answers?.length || 0);
                                const optionCount = (safeText.match(/(?:^|\s)[A-Da-d][\.\)）:：]/g) || []).length;
                                const numberedBlocks = (safeText.match(/(?:^|\n)\s*[\d一二三四五六七八九十]+[\.\)）]/gm) || []).length;
                                const contentLengthScore = Math.min(safeText.length, 12000) / 20;

                                return questionCount * 120 +
                                    answerCount * 90 +
                                    optionCount * 8 +
                                    numberedBlocks * 20 +
                                    contentLengthScore;
                            };

                            let finalContent = docxContent;
                            let analysis = {
                                ...docxAnalysis,
                                source: 'docx-xml'
                            };
                            let bestScore = calculateAnalysisQuality(analysis, finalContent);

                            try {
                                // 给PDF渲染和textLayer生成一点时间
                                await new Promise((resolve) => setTimeout(resolve, 1800));

                                const iframeTextResult = await new Promise((resolve) => {
                                    chrome.runtime.sendMessage({ action: 'extractIframeText' }, (res) => {
                                        if (chrome.runtime.lastError) {
                                            resolve({ success: false, error: chrome.runtime.lastError.message });
                                            return;
                                        }
                                        resolve(res || { success: false, error: 'empty response' });
                                    });
                                });

                                if (iframeTextResult?.success && iframeTextResult.text && iframeTextResult.text.length > 200) {
                                    const iframeText = String(iframeTextResult.text || '').trim();
                                    const iframeAnalysis = analyzeDocxContent(iframeText);
                                    const iframeScore = calculateAnalysisQuality(iframeAnalysis, iframeText);

                                    const shouldUseIframe = !finalContent ||
                                        iframeScore > bestScore * 1.05 ||
                                        (iframeAnalysis.questions?.length || 0) > (analysis.questions?.length || 0);

                                    if (shouldUseIframe) {
                                        finalContent = iframeText;
                                        analysis = {
                                            ...iframeAnalysis,
                                            source: 'iframe-pdf-text',
                                            fallbackFromDocx: (docxAnalysis.questions?.length || 0) <= 1
                                        };
                                        bestScore = iframeScore;

                                        appLogger.info('✅ [Preview页面] 使用 iframe PDF 文本作为主分析源:', {
                                            length: iframeText.length,
                                            questionCount: analysis.questions?.length || 0,
                                            answerCount: analysis.answers?.length || 0,
                                            score: Math.round(iframeScore),
                                            url: iframeTextResult.url
                                        });
                                    } else {
                                        appLogger.info('ℹ️ [Preview页面] iframe 文本质量未超过 DOCX，保留 DOCX 解析结果', {
                                            iframeScore: Math.round(iframeScore),
                                            docxScore: Math.round(bestScore),
                                            iframeLength: iframeText.length,
                                            docxLength: finalContent.length
                                        });
                                    }
                                } else {
                                    appLogger.info('ℹ️ [Preview页面] 未提取到有效iframe文本，尝试 Canvas OCR 二级兜底...');

                                    const extractCurrentPageCanvasImages = () => {
                                        try {
                                            const canvases = Array.from(document.querySelectorAll('canvas'));
                                            if (!canvases.length) return [];

                                            // 过滤掉过小的画布，优先保留 PDF 主渲染页。
                                            const usableCanvases = canvases
                                                .filter((canvas) => {
                                                    const width = Number(canvas.width || 0);
                                                    const height = Number(canvas.height || 0);
                                                    return width >= 300 && height >= 300;
                                                })
                                                .sort((a, b) => (b.width * b.height) - (a.width * a.height));

                                            const images = [];
                                            for (const canvas of usableCanvases) {
                                                try {
                                                    const dataUrl = canvas.toDataURL('image/png');
                                                    if (dataUrl && dataUrl.startsWith('data:image/')) {
                                                        images.push(dataUrl);
                                                    }
                                                } catch (e) {
                                                    // 跨域污染画布会抛错，继续尝试其他画布。
                                                }

                                                if (images.length >= 5) {
                                                    break;
                                                }
                                            }

                                            return images;
                                        } catch (e) {
                                            return [];
                                        }
                                    };

                                    const canvasResult = await new Promise((resolve) => {
                                        chrome.runtime.sendMessage({ action: 'extractIframeCanvasImages' }, (res) => {
                                            if (chrome.runtime.lastError) {
                                                resolve({ success: false, error: chrome.runtime.lastError.message });
                                                return;
                                            }
                                            resolve(res || { success: false, error: 'empty response' });
                                        });
                                    });

                                    let canvasImages = [];
                                    if (canvasResult?.success && Array.isArray(canvasResult.images) && canvasResult.images.length > 0) {
                                        canvasImages = canvasResult.images;
                                        appLogger.info(`🖼️ [Preview页面] 从iframe提取到 ${canvasImages.length} 张canvas，开始OCR...`);
                                    } else {
                                        const localCanvasImages = extractCurrentPageCanvasImages();
                                        if (localCanvasImages.length > 0) {
                                            canvasImages = localCanvasImages;
                                            appLogger.info(`🖼️ [Preview页面] iframe未命中，改用当前页面canvas提取 ${canvasImages.length} 张图像`);
                                        }
                                    }

                                    if (canvasImages.length > 0) {
                                        appLogger.info(`🖼️ [Preview页面] 开始OCR，共 ${canvasImages.length} 张图像...`);

                                        const ocrResult = await new Promise((resolve) => {
                                            chrome.runtime.sendMessage({
                                                action: 'ocrImageDataUrls',
                                                images: canvasImages,
                                                fileName
                                            }, (res) => {
                                                if (chrome.runtime.lastError) {
                                                    resolve({ success: false, error: chrome.runtime.lastError.message });
                                                    return;
                                                }
                                                resolve(res || { success: false, error: 'empty response' });
                                            });
                                        });

                                        if (ocrResult?.success && ocrResult.text && ocrResult.text.length > 100) {
                                            const ocrText = String(ocrResult.text || '').trim();
                                            const ocrAnalysis = analyzeDocxContent(ocrText);
                                            const ocrScore = calculateAnalysisQuality(ocrAnalysis, ocrText);

                                            if (ocrScore >= bestScore * 0.98) {
                                                finalContent = ocrText;
                                                analysis = {
                                                    ...ocrAnalysis,
                                                    source: 'iframe-canvas-ocr',
                                                    fallbackFromDocx: true,
                                                    pageCount: ocrResult.pageCount || canvasImages.length
                                                };
                                                bestScore = ocrScore;
                                                appLogger.info('✅ [Preview页面] 已切换到 Canvas OCR 分析结果:', {
                                                    length: ocrText.length,
                                                    questionCount: analysis.questions?.length || 0,
                                                    answerCount: analysis.answers?.length || 0,
                                                    pageCount: analysis.pageCount,
                                                    score: Math.round(ocrScore)
                                                });
                                            } else {
                                                appLogger.info('ℹ️ [Preview页面] Canvas OCR 结果未优于当前最佳来源，保留原结果', {
                                                    ocrScore: Math.round(ocrScore),
                                                    bestScore: Math.round(bestScore)
                                                });
                                            }
                                        } else {
                                            appLogger.info('ℹ️ [Preview页面] Canvas OCR 未提取到有效文字，回退DOCX解析结果');
                                        }
                                    } else {
                                        appLogger.info('ℹ️ [Preview页面] 未提取到canvas图像，回退DOCX解析结果');
                                    }
                                }
                            } catch (e) {
                                appLogger.warn('⚠️ [Preview页面] iframe文本提取失败，回退DOCX:', e.message);
                            }
                            
                            // 将结果存储到window，供opener页面访问
                            window._zhsPreviewFileResult = {
                                fileUrl: fileUrl,
                                fileName: fileName,
                                content: finalContent,
                                analysis: analysis,
                                success: true
                            };

                            // 同步写入扩展共享缓存，避免 opener 消息丢失
                            persistPreviewResultToSharedStore(window._zhsPreviewFileResult, 'preview-page');
                            
                            // 尝试通知opener页面 - 发送分析结果
                            if (window.opener && !window.opener.closed) {
                                try {
                                    window.opener.postMessage({
                                        type: 'ZHS_PREVIEW_FILE_READY',
                                        data: {
                                            fileUrl: fileUrl,
                                            fileName: fileName,
                                            content: finalContent,
                                            analysis: analysis
                                        }
                                    }, '*');
                                    appLogger.info('✅ [Preview页面] 已通知opener页面（包含分析结果）');
                                    
                                    // 设置完成标记，防止Preview页面过早关闭
                                    window._zhsPreviewProcessing = true;
                                    
                                    // 500ms后清除标记，给opener充足时间处理
                                    setTimeout(() => {
                                        window._zhsPreviewProcessing = false;
                                        appLogger.info('✅ [Preview页面] 标记已清除，可关闭');
                                    }, 500);
                                    appLogger.info('📊 [Preview页面] 分析摘要:', {
                                        title: analysis.title,
                                        questions: analysis.questions.slice(0, 2).map(q => q.substring(0, 50) + '...'),
                                        answers: analysis.answers.slice(0, 2).map(a => a.substring(0, 50) + '...')
                                    });
                                } catch (e) {
                                    appLogger.warn('⚠️ [Preview页面] 无法通知opener:', e.message);
                                }
                            }
                        } else {
                            appLogger.error('❌ [Preview页面] 文件处理失败:', response);
                        }
                    });
                } else {
                    appLogger.warn('⚠️ [Preview页面] URL中未找到u参数');
                }
            } catch (e) {
                appLogger.error('❌ [Preview页面] URL解析失败:', e);
            }
        }
    })();

    // ==========================================
    // content-utils.js 已加载全局状态和工具，
    // 下面开始定义具体的功能函数
    // ==========================================

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

    // ========== 监听来自Preview页面的文件信息 ==========
    const ZHS_SHARED_PREVIEW_RESULTS_KEY = 'zhs_shared_preview_results_v1';
    window._zhsPreviewFileResults = window._zhsPreviewFileResults || [];

    const PREVIEW_NAME_SPACE_REGEX = /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;

    function normalizePreviewName(name) {
        return String(name || '')
            .normalize('NFKC')
            .replace(PREVIEW_NAME_SPACE_REGEX, '')
            .replace(/["'`“”‘’]/g, '')
            .toLowerCase();
    }

    function normalizePreviewNameLoose(name) {
        return normalizePreviewName(name).replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    }

    function isLikelySamePreviewName(leftName, rightName) {
        const left = normalizePreviewName(leftName);
        const right = normalizePreviewName(rightName);
        if (!left || !right) return false;
        if (left === right || left.includes(right) || right.includes(left)) return true;

        const looseLeft = normalizePreviewNameLoose(left);
        const looseRight = normalizePreviewNameLoose(right);
        if (!looseLeft || !looseRight) return false;

        return looseLeft === looseRight || looseLeft.includes(looseRight) || looseRight.includes(looseLeft);
    }

    function mergePreviewResultIntoMemory(fileInfo, source = 'unknown') {
        if (!fileInfo?.fileUrl) return false;

        const exists = window._zhsPreviewFileResults.some((item) => {
            return String(item?.fileUrl || '') === String(fileInfo.fileUrl || '');
        });

        if (exists) {
            return false;
        }

        window._zhsPreviewFileResults.push({
            fileName: fileInfo.fileName,
            fileUrl: fileInfo.fileUrl,
            content: fileInfo.content,
            analysis: fileInfo.analysis || null,
            timestamp: Number(fileInfo.timestamp || Date.now())
        });

        appLogger.info(`📎 [主页面] 缓存新增(${source})：${fileInfo.fileName}（共${window._zhsPreviewFileResults.length}个）`);
        return true;
    }

    let _storageWriteQueue = Promise.resolve();

    function persistPreviewResultToSharedStore(fileInfo, source = 'unknown') {
        _storageWriteQueue = _storageWriteQueue.then(() => new Promise((resolve) => {
            try {
                if (!chrome?.storage?.local || !fileInfo?.fileUrl) { resolve(); return; }

                chrome.storage.local.get([ZHS_SHARED_PREVIEW_RESULTS_KEY], (data) => {
                    if (chrome.runtime.lastError) {
                        appLogger.warn('⚠️ [Preview共享缓存] 读取失败:', chrome.runtime.lastError.message);
                        resolve(); return;
                    }

                    const existing = Array.isArray(data?.[ZHS_SHARED_PREVIEW_RESULTS_KEY]) ? data[ZHS_SHARED_PREVIEW_RESULTS_KEY] : [];
                    const deduped = existing.filter((item) => {
                        const sameUrl = String(item?.fileUrl || '') === String(fileInfo.fileUrl || '');
                        return !sameUrl;
                    });

                    deduped.push({
                        fileName: fileInfo.fileName,
                        fileUrl: fileInfo.fileUrl,
                        content: fileInfo.content,
                        analysis: fileInfo.analysis || null,
                        timestamp: Date.now(),
                        source
                    });

                    const limited = deduped.slice(-PREVIEW_CACHE_MAX_ITEMS);
                    chrome.storage.local.set({ [ZHS_SHARED_PREVIEW_RESULTS_KEY]: limited }, () => {
                        if (chrome.runtime.lastError) {
                            appLogger.warn('⚠️ [Preview共享缓存] 写入失败:', chrome.runtime.lastError.message);
                            resolve(); return;
                        }
                        appLogger.info(`💾 [Preview共享缓存] 已写入: ${fileInfo.fileName}（共${limited.length}条）`);
                        resolve();
                    });
                });
            } catch (e) {
                appLogger.warn('⚠️ [Preview共享缓存] 持久化异常:', e.message);
                resolve();
            }
        }));
    }

    async function pullSharedPreviewResultsFromStorage(reason = 'manual') {
        return new Promise((resolve) => {
            try {
                if (!chrome?.storage?.local) {
                    resolve(0);
                    return;
                }

                chrome.storage.local.get([ZHS_SHARED_PREVIEW_RESULTS_KEY], (data) => {
                    if (chrome.runtime.lastError) {
                        appLogger.warn('⚠️ [Preview共享缓存] 拉取失败:', chrome.runtime.lastError.message);
                        resolve(0);
                        return;
                    }

                    const records = Array.isArray(data?.[ZHS_SHARED_PREVIEW_RESULTS_KEY]) ? data[ZHS_SHARED_PREVIEW_RESULTS_KEY] : [];
                    let added = 0;
                    for (const record of records) {
                        if (mergePreviewResultIntoMemory(record, `共享存储/${reason}`)) {
                            added++;
                        }
                    }

                    if (added > 0) {
                        appLogger.info(`✅ [Preview共享缓存] 拉取成功(${reason})，新增 ${added} 条`);
                    }
                    resolve(added);
                });
            } catch (e) {
                appLogger.warn('⚠️ [Preview共享缓存] 拉取异常:', e.message);
                resolve(0);
            }
        });
    }

    window.addEventListener('message', (event) => {
        // 只接受特定类型的消息
        if (event.data && event.data.type === 'ZHS_PREVIEW_FILE_READY') {
            const fileInfo = event.data.data;
            appLogger.info('✅ [主页面] 收到preview页面的文件信息:', {
                fileName: fileInfo?.fileName,
                fileUrl: fileInfo?.fileUrl?.substring(0, 100),
                contentLength: fileInfo?.content?.length || 0,
                hasAnalysis: !!fileInfo?.analysis
            });

            // 如果有分析结果，详细记录
            if (fileInfo?.analysis) {
                appLogger.info('📊 [主页面] 文件内容分析:', {
                    title: fileInfo.analysis.title || '(无标题)',
                    structure: {
                        hasTitle: fileInfo.analysis.structure.hasTitle,
                        hasQuestions: fileInfo.analysis.structure.hasQuestions,
                        hasAnswers: fileInfo.analysis.structure.hasAnswers
                    },
                    questionCount: fileInfo.analysis.questions?.length || 0,
                    answerCount: fileInfo.analysis.answers?.length || 0,
                    explanationCount: fileInfo.analysis.answerExplanations?.length || 0,
                    keyPointCount: fileInfo.analysis.keyPoints?.length || 0
                });

                // 记录所有题目和答案（包括解析）
                if (fileInfo.analysis.questions?.length > 0) {
                    appLogger.info('📝 [主页面] 识别到的所有题目:');
                    fileInfo.analysis.questions.forEach((q, i) => {
                        appLogger.info(`  ${i+1}. ${q.substring(0, 100)}${q.length > 100 ? '...' : ''}`);
                    });
                }

                if (fileInfo.analysis.answers?.length > 0) {
                    appLogger.info('✅ [主页面] 识别到的所有答案:');
                    fileInfo.analysis.answers.forEach((a, i) => {
                        appLogger.info(`  ${i + 1}. 答案: ${a.substring(0, 80)}${a.length > 80 ? '...' : ''}`);
                        if (fileInfo.analysis.answerExplanations?.[i]) {
                            appLogger.info(`     解析: ${fileInfo.analysis.answerExplanations[i].substring(0, 80)}${fileInfo.analysis.answerExplanations[i].length > 80 ? '...' : ''}`);
                        }
                    });
                }
            }
            
            // 存储到数组中，供附件提取使用（带去重）
            const merged = mergePreviewResultIntoMemory({
                fileName: fileInfo.fileName,
                fileUrl: fileInfo.fileUrl,
                content: fileInfo.content,
                analysis: fileInfo.analysis || null,
                timestamp: Date.now()
            }, 'postMessage');

            if (merged) {
                persistPreviewResultToSharedStore(fileInfo, 'main-postMessage');
            }

            appLogger.info(`📎 [主页面] 已缓存文件信息（共${window._zhsPreviewFileResults.length}个），${fileInfo?.analysis ? '包含分析' : '无分析'}`);
        }
    });

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
        const timeoutId = setTimeout(() => {
            appLogger.warn('⚠️ [Content] Background连接超时（5秒无响应），可能需要刷新页面');
        }, 5000);

        chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
            clearTimeout(timeoutId);
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
    // 自动跳转与任务接力
    // ==========================================
    const PENDING_TASK_KEY = 'zhai_pending_task_v1';
    const PENDING_TASK_TTL_MS = 3 * 60 * 1000;

    function isHomeworkContextPage() {
        const url = String(window.location.href || '').toLowerCase();
        const byUrl = url.includes('homework') || url.includes('work') || url.includes('assignment') || url.includes('exam');
        if (byUrl) return true;

        const byDom = !!(
            document.querySelector('table tbody tr') ||
            document.querySelector('[class*="homework"]') ||
            document.querySelector('[class*="assignment"]') ||
            document.querySelector('[class*="exam"]') ||
            document.querySelector('.el-table__body')
        );
        return byDom;
    }

    function savePendingTask(action, payload = {}) {
        try {
            const task = {
                action,
                payload,
                createdAt: Date.now(),
                fromUrl: window.location.href
            };
            localStorage.setItem(PENDING_TASK_KEY, JSON.stringify(task));
            appLogger.info('🧭 [自动跳转] 已保存待执行任务:', action);
        } catch (error) {
            appLogger.warn('⚠️ [自动跳转] 保存待执行任务失败:', error.message);
        }
    }

    function readPendingTask() {
        try {
            const raw = localStorage.getItem(PENDING_TASK_KEY);
            if (!raw) return null;
            const task = JSON.parse(raw);
            if (!task || !task.createdAt || Date.now() - task.createdAt > PENDING_TASK_TTL_MS) {
                localStorage.removeItem(PENDING_TASK_KEY);
                return null;
            }
            return task;
        } catch (error) {
            localStorage.removeItem(PENDING_TASK_KEY);
            return null;
        }
    }

    function clearPendingTask() {
        localStorage.removeItem(PENDING_TASK_KEY);
    }

    function isElementVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function tryNavigateToHomeworkPage() {
        const candidateSelectors = [
            'a[href*="homework"]',
            'a[href*="exam"]',
            'a[href*="work"]',
            'a[href*="assignment"]',
            'button',
            '[role="button"]',
            'span',
            'div'
        ];

        const keywordRegex = /(作业|考试|测验|批改|待批改|assignment|homework|exam|quiz|test)/i;
        const visited = new Set();
        const candidates = [];

        candidateSelectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                if (visited.has(el)) return;
                visited.add(el);
                if (!isElementVisible(el)) return;

                const text = String(el.textContent || '').trim();
                const href = String(el.getAttribute?.('href') || '').toLowerCase();
                if (!keywordRegex.test(text) && !href.includes('homework') && !href.includes('assignment') && !href.includes('exam')) {
                    return;
                }
                candidates.push(el);
            });
        });

        if (candidates.length === 0) {
            appLogger.warn('⚠️ [自动跳转] 未找到作业/考试入口元素');
            return false;
        }

        const target = candidates[0];
        const href = target.getAttribute?.('href');
        appLogger.info('🧭 [自动跳转] 命中入口:', (target.textContent || '').trim().slice(0, 30));

        if (href && href !== '#' && !href.toLowerCase().startsWith('javascript')) {
            window.location.href = href;
            return true;
        }

        target.click();
        return true;
    }

    async function executeFeatureAction(action, payload = {}) {
        if (action === 'triggerAutoGrading') {
            await startAutoGradingFlow();
            return;
        }
        if (action === 'triggerHomeworkAnalysis') {
            await startHomeworkAnalysis();
            return;
        }
        if (action === 'triggerOneClickRemind') {
            await startOneClickRemind();
            return;
        }
        if (action === 'triggerSingleStudent') {
            await startSingleStudentGrading(payload.studentName || '');
            return;
        }
        if (action === 'triggerManualCriteria') {
            openManualCriteriaEditor();
            return;
        }
    }

    async function runOrQueueFeatureAction(action, payload = {}) {
        const shouldRequireHomeworkPage = [
            'triggerAutoGrading',
            'triggerHomeworkAnalysis',
            'triggerOneClickRemind',
            'triggerSingleStudent'
        ].includes(action);

        // manual: 不自动跳转、不做任务接力
        if (AUTO_GRADING_STATE.autoExecutionMode === AUTO_EXECUTION_MODES.manual) {
            await executeFeatureAction(action, payload);
            return { queued: false, mode: AUTO_EXECUTION_MODES.manual };
        }

        if (!shouldRequireHomeworkPage || isHomeworkContextPage()) {
            await executeFeatureAction(action, payload);
            return { queued: false, mode: AUTO_GRADING_STATE.autoExecutionMode };
        }

        savePendingTask(action, payload);
        const started = tryNavigateToHomeworkPage();
        if (started) {
            const tip = AUTO_GRADING_STATE.autoExecutionMode === AUTO_EXECUTION_MODES.navigateOnly
                ? '🧭 已自动跳转到作业页，到达后请手动点击执行'
                : '🧭 已自动跳转到作业页，到达后会自动执行任务';
            showNotification(tip, '#2b2b2b');
            return { queued: true, mode: AUTO_GRADING_STATE.autoExecutionMode };
        }

        return { queued: true, needManualNavigate: true, mode: AUTO_GRADING_STATE.autoExecutionMode };
    }

    // 暴露到全局作用域，供 content-floating-ball.js 调用
    window.runOrQueueFeatureAction = runOrQueueFeatureAction;

    async function resumePendingTaskIfNeeded() {
        const task = readPendingTask();
        if (!task) return;

        appLogger.info('🧭 [自动跳转] 检测到待执行任务:', task.action);
        if (!isHomeworkContextPage()) {
            tryNavigateToHomeworkPage();
            return;
        }

        clearPendingTask();
        if (AUTO_GRADING_STATE.autoExecutionMode === AUTO_EXECUTION_MODES.navigateOnly) {
            showNotification('✅ 已到达作业页，请手动点击对应功能开始执行', '#4CAF50');
            return;
        }

        showNotification('✅ 已到达作业页，自动继续执行任务', '#4CAF50');
        try {
            await executeFeatureAction(task.action, task.payload || {});
        } catch (error) {
            appLogger.error('❌ [自动跳转] 恢复任务失败:', error);
            showNotification(`❌ 自动执行失败: ${error.message}`, '#FF5252');
        }
    }

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
                        const result = await runOrQueueFeatureAction('triggerAutoGrading');
                        sendResponse({ success: true, message: result.queued ? '已自动跳转，稍后自动执行自动批改' : '自动批改已启动' });
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
                        const result = await runOrQueueFeatureAction('triggerHomeworkAnalysis');
                        sendResponse({ success: true, message: result.queued ? '已自动跳转，稍后自动执行作业分析' : 'AI作业分析已启动' });
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
                        const result = await runOrQueueFeatureAction('triggerOneClickRemind');
                        sendResponse({ success: true, message: result.queued ? '已自动跳转，稍后自动执行一键催交' : '一键催交已启动' });
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
                        const result = await runOrQueueFeatureAction('triggerSingleStudent', { studentName });
                        sendResponse({ success: true, message: result.queued ? `已自动跳转，稍后自动批改: ${studentName}` : `已开始批改学生: ${studentName}` });
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

            if (request.action === 'toggleAutoMode') {
                appLogger.debug('🔄 [Popup] 切换自动模式:', request.value);
                setAutoExecutionMode(request.value !== false ? AUTO_EXECUTION_MODES.full : AUTO_EXECUTION_MODES.manual);
                persistAutoExecutionModeSetting(AUTO_GRADING_STATE.autoExecutionMode);
                sendResponse({ success: true, value: AUTO_GRADING_STATE.autoModeEnabled, mode: AUTO_GRADING_STATE.autoExecutionMode });
                return false;
            }

            if (request.action === 'setAutoExecutionMode') {
                appLogger.debug('🔄 [Popup] 设置自动执行模式:', request.mode);
                setAutoExecutionMode(request.mode);
                persistAutoExecutionModeSetting(AUTO_GRADING_STATE.autoExecutionMode);
                sendResponse({ success: true, mode: AUTO_GRADING_STATE.autoExecutionMode, autoModeEnabled: AUTO_GRADING_STATE.autoModeEnabled });
                return false;
            }

            if (request.action === 'getExtensionSettings') {
                sendResponse({
                    success: true,
                    includeReviewedSubmissions: AUTO_GRADING_STATE.includeReviewedSubmissions,
                    showRuleScoringBreakdown: AUTO_GRADING_STATE.showRuleScoringBreakdown,
                    autoModeEnabled: AUTO_GRADING_STATE.autoModeEnabled,
                    autoExecutionMode: AUTO_GRADING_STATE.autoExecutionMode
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
    // 2-5. UI组件和浮窗球
    // ==========================================
    // 注意：样式注入、浮窗球创建、UI辅助函数等已迁移到 content-floating-ball.js
    // 包括：injectStyles, createFloatingBall, makeDraggable, animateRingStart, animateRingStop,
    // showFloatingPanel, updatePanelBody, buildRemindProgressPanelHTML, buildAutoGradeProgressPanelHTML, updatePageFeedback

    // ==========================================
    // 6. 学生列表自动导航和自动批改
    // ==========================================
    // 注意：学生列表检测提取相关函数已迁移到 content-parser.js
    // 包括：detectStudentList, getTotalStudentCount, getTotalPages, extractStudentsFromCurrentPage 等
    
    // 自动点击学生进入批改界面
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
        const answerBox = primaryAreas[0];
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
        const markdownContainer = primaryAreas[1];
        if (markdownContainer) {
            const markdownText = (markdownContainer.textContent || markdownContainer.innerText || '').trim();
            if (markdownText && markdownText.length > 10) {
                appLogger.debug(`✅ [自动批改] 从 .markdown-latex-container 提取答案, 长度: ${markdownText.length}`);
                appLogger.debug(`📄 [自动批改] 内容预览: ${markdownText.substring(0, 100)}...`);
                return markdownText;
            }
        }
        
        // 检查 .evaluation-content 容器
        const evaluationContent = primaryAreas[2];
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
                if (img.offsetParent === null) return false; // 不可见（避免 getComputedStyle 强制 reflow）

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
            const maxRetries = OCR_MAX_RETRIES;

            while (retryCount <= maxRetries) {
                try {
                    appLogger.debug(`📸 [图片处理] OCR 尝试 ${retryCount + 1}/${maxRetries + 1}...`);
                    response = await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('OCR 请求超时'));
                        }, OCR_TIMEOUT_MS);
                        
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
                const combinedText = allText.map((text, i) => `【第 ${i + 1} 页开始】\n\n${text}`).join('\n\n');
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

            // 页面无标准答案时，使用手动设置中的固定答案/范文作为参考
            if (!standardAnswerForAI) {
                const manualReferenceAnswer = String(conditions.referenceAnswer || '').trim();
                if (manualReferenceAnswer) {
                    if (conditions.referenceAnswerType === 'model_essay') {
                        standardAnswerForAI = `参考范文：\n${manualReferenceAnswer}`;
                    } else {
                        standardAnswerForAI = `参考答案：${manualReferenceAnswer}`;
                    }
                    appLogger.info('🧩 [评语生成] 已使用手动设置的答案部分作为AI参考');
                }
            }
            
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
                let standardAnswer = extractStandardAnswer();
                let studentAnswer = extractStudentAnswer();

                // 页面无标准答案时，兜底使用手动设置中的固定答案/范文
                if (!standardAnswer && AUTO_GRADING_STATE.autoGradingConditions?.isSet) {
                    const manualReferenceAnswer = String(AUTO_GRADING_STATE.autoGradingConditions.referenceAnswer || '').trim();
                    if (manualReferenceAnswer) {
                        standardAnswer = manualReferenceAnswer;
                        appLogger.info('🧩 [自动批改] 已使用手动设置的参考答案/范文作为标准答案');
                    }
                }
                
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
            referenceAnswerType: currentState.isSet ? (currentState.referenceAnswerType || '') : '',
            referenceAnswer: currentState.isSet ? (currentState.referenceAnswer || '') : '',
            commonMistakes: currentState.isSet && currentState.commonMistakes.length > 0
                ? currentState.commonMistakes
                : ['', '']  // 默认2个空白错误
        };
        
        // 显示可编辑面板（手动模式）
        showAnalysisPanel(manualTemplate, true);
        showNotification('✏️ 请设置评分标准', '#2b2b2b');
    }

    // 暴露到全局作用域，供 content-floating-ball.js 调用
    window.openManualCriteriaEditor = openManualCriteriaEditor;
    
    // 获取所有附件的真实下载URL（支持自动点击预览提取）
    async function extractAttachmentUrls() {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        // 先从共享存储拉取一次，补偿 postMessage 丢失场景
        await pullSharedPreviewResultsFromStorage('提取开始');

        const normalizeUrl = (raw) => {
            if (!raw || typeof raw !== 'string') return null;
            const trimmed = raw.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith('//')) return `${window.location.protocol}${trimmed}`;
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
            if (trimmed.startsWith('/')) return `${window.location.origin}${trimmed}`;
            return null;
        };

        const getExpectedExtFromFileName = (name) => {
            return (String(name || '').trim().toLowerCase().match(/\.(docx|doc|xlsx|xls|pptx|ppt|pdf|txt|zip)$/) || [])[0] || '';
        };

        const isImageLikeUrl = (url) => {
            const lower = String(url || '').toLowerCase();
            const pure = lower.split('?')[0].split('#')[0];
            return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'].some(ext => pure.endsWith(ext));
        };

        const decodeBase64Param = (value) => {
            try {
                const raw = decodeURIComponent(String(value || '').trim());
                if (!raw) return '';
                const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
                return atob(padded);
            } catch (_) {
                return '';
            }
        };

        // 🔍 从 preview/onlinePreview/getCorsFile 链接中提取真实下载URL
        const extractRealUrlFromPreview = (previewUrl) => {
            if (!previewUrl || !/^https?:\/\//i.test(previewUrl)) {
                return previewUrl;
            }

            try {
                let current = previewUrl;
                for (let depth = 0; depth < 3; depth++) {
                    const url = new URL(current);
                    const lower = current.toLowerCase();

                    const isPreviewLike = lower.includes('/resource/preview') || lower.includes('/resource/onlinepreview') || lower.includes('/resource/getcorsfile');
                    if (!isPreviewLike) break;

                    const encoded = url.searchParams.get('u') || url.searchParams.get('urlPath');
                    if (!encoded) break;

                    const decoded = decodeBase64Param(encoded);
                    if (!decoded) break;

                    appLogger.info(`🔓 [URL解码] 第${depth + 1}层解码成功:`);
                    appLogger.info(`   原链接: ${current.substring(0, 90)}...`);
                    appLogger.info(`   解码后: ${decoded.substring(0, 120)}`);

                    if (/^https?:\/\//i.test(decoded)) {
                        current = decoded;
                    } else {
                        break;
                    }
                }

                // 清理拼接在真实URL后的文件名参数
                if (current.includes('&n=')) {
                    current = current.split('&n=')[0];
                }

                return current;
            } catch (error) {
                appLogger.warn(`⚠️ [URL解码] 解码失败: ${error.message}`);
                return previewUrl;
            }
        };

        const isUsefulFileUrl = (url) => {
            if (!url) return false;
            const lower = url.toLowerCase();

            // 🚫 先排除明显图片，避免被“受信任域名”误放行。
            if (isImageLikeUrl(url)) {
                return false;
            }

            // 🎯 特别接受 polymas/云预览链接（后续会解码为真实URL）
            if ((lower.includes('/resource/preview') || lower.includes('/resource/onlinepreview') || lower.includes('/resource/getcorsfile')) && (lower.includes('u=') || lower.includes('urlpath='))) {
                return true;
            }

            // 🚫 严格排除明显的非文件资源
            const excludedPatterns = [
                '.js', '.css', '.map', '.json', '.xml', '.html',
                '.woff', '.woff2', '.ttf', '.eot',
                'google.cn',  // Google
                'baidu.com',  // Baidu统计
                'zhihuishu.com/able-commons',  // jQuery等库
            ];
            
            if (excludedPatterns.some(p => lower.includes(p))) {
                return false;
            }

            // 明确的附件文件类型（白名单）
            const documentExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.zip', '.rar', '.7z'];
            const hasDocumentExt = documentExtensions.some(ext => lower.includes(ext));
            
            // ✅ 如果有文档扩展名，直接放行
            if (hasDocumentExt) {
                return true;
            }

            // 🎯 受信任域名：file.zhihuishu.com 或 aliyuncs.com 的URL基本都接受（作为可能的下载链接）
            try {
                const parsed = new URL(url);
                const host = parsed.hostname.toLowerCase();
                
                // ✅ 这些域名下的URL可能是下载/预览链接
                const isTrustedDomain = [
                    'file.zhihuishu.com',
                    'aliyuncs.com',
                    'polymas.com'
                ].some(domain => host.includes(domain));
                
                if (isTrustedDomain) {
                    // ✅ polymas和aliyuncs的URL一般是安全的（即使是图片，后续会过滤）
                    return true;
                }
            } catch (_) {
                // 非标准URL继续走关键字判断
            }

            // 🚫 排除看起来像是资源文件的URL
            if (lower.includes('/avatar/') || lower.includes('/icon/') || lower.includes('/user/weixin/')) {
                return false;
            }

            // 没有文档扩展名和受信任域名，通过关键字判断
            const positive = ['download', 'attachment', 'preview', 'file'];
            const negative = ['icon', 'logo', 'avatar'];
            
            const hasPositive = positive.some(k => lower.includes(k));
            const hasNegative = negative.some(k => lower.includes(k));
            
            return hasPositive && !hasNegative;
        };

        const collectCandidateUrls = (root = document) => {
            const selectors = [
                'a[href]',
                '[data-url]',
                '[data-file-url]',
                '[data-download-url]',
                '[src]',
                'iframe[src]'
            ];
            const candidates = new Set();
            const allRawUrls = [];  // 🔍 调试：保存所有找到的URL

            selectors.forEach((selector) => {
                root.querySelectorAll(selector).forEach((el) => {
                    const rawValues = [
                        el.getAttribute('href'),
                        el.getAttribute('data-url'),
                        el.getAttribute('data-file-url'),
                        el.getAttribute('data-download-url'),
                        el.getAttribute('src')
                    ];
                    rawValues.forEach((raw) => {
                        if (raw) {
                            allRawUrls.push(raw);  // 🔍 保存原始URL
                        }
                        let url = normalizeUrl(raw);
                        
                        // 🔓 如果是预览链接，提取真实下载URL
                        if (url && url.includes('polymas.com/resource/preview')) {
                            url = extractRealUrlFromPreview(url);
                        }
                        
                        if (isUsefulFileUrl(url)) candidates.add(url);
                    });
                });
            });

            // 添加从window.open拦截到的URL
            if (window._zhsInterceptedPreviewUrls && window._zhsInterceptedPreviewUrls.length > 0) {
                appLogger.info(`📎 [URL提取] 从window.open拦截中添加 ${window._zhsInterceptedPreviewUrls.length} 个preview URL`);
                window._zhsInterceptedPreviewUrls.forEach(item => {
                    if (item.decodedUrl) {
                        allRawUrls.push(item.decodedUrl);
                        const normalized = normalizeUrl(item.decodedUrl);
                        if (normalized && isUsefulFileUrl(normalized)) {
                            candidates.add(normalized);
                            appLogger.debug(`  ✅ 添加解码URL: ${item.decodedUrl.substring(0, 80)}`);
                        }
                    }
                    if (item.previewUrl) {
                        allRawUrls.push(item.previewUrl);
                        let url = normalizeUrl(item.previewUrl);
                        if (url && url.includes('polymas.com/resource/preview')) {
                            url = extractRealUrlFromPreview(url);
                        }
                        if (url && isUsefulFileUrl(url)) {
                            candidates.add(url);
                            appLogger.debug(`  ✅ 添加preview URL: ${item.previewUrl.substring(0, 80)}`);
                        }
                    }
                });
            }

            // 添加从 Performance 资源轨迹中捕获的 URL（用于无跳转/无弹窗的静默预览）
            try {
                const perfEntries = (performance && typeof performance.getEntriesByType === 'function')
                    ? performance.getEntriesByType('resource')
                    : [];
                if (perfEntries && perfEntries.length > 0) {
                    let perfHitCount = 0;
                    const recentEntries = perfEntries.slice(-500);
                    recentEntries.forEach((entry) => {
                        const raw = entry?.name;
                        if (!raw || typeof raw !== 'string') return;
                        const lower = raw.toLowerCase();
                        const isPreviewTrace = lower.includes('/resource/preview') ||
                            lower.includes('/resource/onlinepreview') ||
                            lower.includes('/resource/getcorsfile');
                        const isLikelyFileHost = lower.includes('file.zhihuishu.com') || lower.includes('aliyuncs.com');

                        if (!isPreviewTrace && !isLikelyFileHost) return;

                        allRawUrls.push(raw);
                        perfHitCount++;

                        let normalized = normalizeUrl(raw);
                        if (normalized && isPreviewTrace) {
                            normalized = extractRealUrlFromPreview(normalized);
                        }
                        if (normalized && isUsefulFileUrl(normalized)) {
                            candidates.add(normalized);
                        }
                    });

                    if (perfHitCount > 0) {
                        appLogger.info(`📎 [URL提取] 从Performance轨迹扫描到 ${perfHitCount} 条候选请求`);
                    }
                }
            } catch (perfError) {
                appLogger.debug(`⚠️ [URL提取] Performance轨迹扫描失败: ${perfError.message}`);
            }

            // 🔍 调试日志：显示找到的所有URL和过滤结果
            if (allRawUrls.length > 0) {
                appLogger.info(`📎 [URL提取] 原始找到 ${allRawUrls.length} 个URL`);
                allRawUrls.slice(0, 10).forEach((url, i) => {  // 只显示前10个
                    const useful = isUsefulFileUrl(normalizeUrl(url)) ? '✅' : '❌';
                    appLogger.info(`  ${useful} ${i + 1}. ${url.substring(0, 80)}`);
                });
                if (allRawUrls.length > 10) {
                    appLogger.info(`  ... 还有 ${allRawUrls.length - 10} 个URL未显示`);
                }
            } else {
                appLogger.info('📎 [URL提取] 页面上没有找到任何URL候选');
            }

            appLogger.info(`📎 [URL提取] 经过过滤，有 ${candidates.size} 个有效URL`);

            return Array.from(candidates);
        };

        const pickBestUrl = (urls, fileName = '') => {
            if (!urls || urls.length === 0) {
                appLogger.debug(`📎 [URL评分] ${fileName} - 没有候选 URL (输入为${urls === null ? 'null' : 'empty array'})`);
                return null;
            }
            const lowerFileName = String(fileName || '').trim().toLowerCase();
            const expectedExt = getExpectedExtFromFileName(fileName);

            // 当文件名自带明确扩展名时，优先选择匹配该扩展名的URL
            // 但对于OSS URL（无扩展名），不强制要求扩展名匹配
            if (expectedExt) {
                const expectedMatches = urls.filter((url) => String(url || '').toLowerCase().includes(expectedExt));
                
                // 如果有匹配扩展名的URL，优先使用
                if (expectedMatches.length > 0) {
                    urls = expectedMatches;
                } else {
                    // 检查是否有OSS URL（这些URL通常没有扩展名但是有效的文件链接）
                    const ossUrls = urls.filter((url) => {
                        const lower = String(url || '').toLowerCase();
                        const isPureImage = isImageLikeUrl(url);
                        return lower.includes('aliyuncs.com') || 
                               lower.includes('polymas') || 
                               lower.includes('file.zhihuishu.com')
                            ? !isPureImage
                            : false;
                    });
                    
                    if (ossUrls.length > 0) {
                        appLogger.info(`✅ [URL评分] ${fileName} - 未找到带${expectedExt}后缀的URL，但找到 ${ossUrls.length} 个OSS URL，将尝试使用`);
                        urls = ossUrls;
                    } else {
                        appLogger.warn(`⚠️ [URL评分] ${fileName} - 候选URL均不匹配目标扩展名 ${expectedExt}，且无OSS URL可用`);
                        return null;
                    }
                }
            }

            // 先过滤掉明显非文档文件（图片、前端资源等）
            const documentUrls = urls.filter((url) => {
                const lower = String(url || '').toLowerCase();

                if (expectedExt && isImageLikeUrl(url)) {
                    return false;
                }
                
                // ✅ 允许明确的文档类型
                const docExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.zip', '.rar', '.7z'];
                if (docExtensions.some(ext => lower.includes(ext))) {
                    return true;
                }
                
                // 🚫 严格排除前端资源和库
                if (lower.includes('google.cn') || lower.includes('baidu.com') || 
                    lower.includes('jquery') || lower.includes('assets/') ||
                    ['.js', '.css', '.map', '.json', '.xml'].some(ext => lower.endsWith(ext))) {
                    return false;
                }
                
                // 🚫 严格排除明显的图片/头像
                if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'].some(ext => lower.endsWith(ext)) ||
                    lower.includes('/avatar/') || lower.includes('/user/weixin/') || lower.includes('/ablecommons/demo/')) {
                    return false;
                }
                
                // ✅ 接受 polymas/aliyuncs/file.zhihuishu.com 的URL（可能是预览/下载链接）
                if (lower.includes('aliyuncs.com') || lower.includes('polymas') || 
                    lower.includes('file.zhihuishu.com')) {
                    return true;
                }
                
                // ✅ 其他含有预览/下载关键字的URL
                if (lower.includes('download') || lower.includes('attachment') || 
                    lower.includes('preview')) {
                    return true;
                }
                
                return false;
            });
            
            // 如果过滤后没有文档URL，退回到至少接受polymas URL的版本
            const candidates = documentUrls.length > 0 ? documentUrls : urls.filter((url) => {
                const lower = String(url || '').toLowerCase();

                if (expectedExt && isImageLikeUrl(url)) {
                    return false;
                }
                
                // 🚫 排除明显的垃圾
                if (lower.includes('google.cn') || lower.includes('baidu.com') || 
                    lower.includes('jquery') || lower.includes('assets/') ||
                    ['.js', '.css', '.map', '.json', '.xml', '.html'].some(ext => lower.endsWith(ext))) {
                    return false;
                }
                
                // ✅ 保留 polymas/aliyuncs/file.zhihuishu.com（即使是图片，后面会评分处理）
                if (lower.includes('aliyuncs.com') || lower.includes('polymas') || 
                    lower.includes('file.zhihuishu.com')) {
                    return true;
                }
                
                return false;
            });
            
            // 🔍 调试日志：显示所有候选URL
            if (candidates.length > 1) {
                appLogger.debug(`📎 [URL评分] ${candidates.length} 个候选URL：`);
                candidates.forEach((url, i) => {
                    appLogger.debug(`  ${i + 1}. ${url.substring(0, 100)}`);
                });
            }

            const scored = candidates.map((url) => {
                const lower = url.toLowerCase();
                let score = 0;
                
                // 🚀 基础分数：受信任域名的URL（可能是真正的下载/预览链接）
                if (lower.includes('aliyuncs.com') || lower.includes('polymas') || 
                    lower.includes('file.zhihuishu.com')) {
                    score += 15;  // 基础分数：这些域名下的URL值得信任
                }
                
                // 路径关键字评分
                if (lower.includes('download')) score += 6;
                if (lower.includes('attachment')) score += 4;
                if (lower.includes('/file')) score += 3;
                if (lower.includes('preview')) score += 2;
                
                // 🎯 无扩展名URL加分（很可能是动态下载链接）
                if (!lower.match(/\.\w+$/)) {
                    score += 8;
                }
                
                // 文件名匹配（高优先级）
                if (lowerFileName && lower.includes(lowerFileName.replace(/\s+/g, ''))) score += 12;

                // 与目标附件扩展名一致时大幅加分
                if (expectedExt && lower.includes(expectedExt)) score += 20;
                
                // 文件扩展名评分
                const fileExtensions = {
                    '.docx': 10,
                    '.doc': 10,
                    '.xlsx': 9,
                    '.xls': 9,
                    '.pptx': 8,
                    '.ppt': 8,
                    '.pdf': 7,
                    '.txt': 5,
                    '.zip': 3,
                    '.js': -15,     // 🚫 严格扣分JS文件
                    '.css': -15,
                    '.map': -15,
                    '.png': -8,     // ⚠️ 图片扣分但不是非常严重（图片仍可能是有效资源）
                    '.jpg': -8,
                    '.jpeg': -8,
                    '.gif': -8,
                    '.svg': -8,
                    '.webp': -8,
                    '.bmp': -8,
                    '.ico': -8
                };
                
                for (const [ext, points] of Object.entries(fileExtensions)) {
                    if (lower.endsWith(ext)) {
                        score += points;
                        break;
                    }
                }

                // 若目标是文档附件，则图片链接直接降为极低优先级，基本不可能被选中。
                if (expectedExt && isImageLikeUrl(url)) {
                    score -= 120;
                }
                
                // 🚫 严重扣分：明显是头像或演示图片的路径
                if (lower.includes('/avatar/') || lower.includes('/user/weixin/') || 
                    lower.includes('/ablecommons/demo/')) {
                    score -= 20;
                }
                
                return { url, score };
            });

            scored.sort((a, b) => b.score - a.score);
            
            // 🔍 调试日志：显示评分结果
            if (scored.length > 1) {
                appLogger.debug(`📎 [URL评分] 排序后 (Top 3)：`);
                scored.slice(0, 3).forEach((item, i) => {
                    const fileName = item.url.split('/').pop();
                    appLogger.debug(`  ${i + 1}. ${fileName} (分数: ${item.score})`);
                });
            }
            
            // 🎯 返回最高分的URL（即使分数为负也可能是最好的选择，因为可能是polymas的动态链接）
            const bestUrl = scored[0]?.url || null;
            if (bestUrl) {
                appLogger.debug(`📎 [URL评分] ${fileName} - 选择最高分URL: ${bestUrl.substring(0, 80)}`);
            }
            return bestUrl;
        };

        const closePreviewIfNeeded = async () => {
            const closeSelectors = [
                '.el-dialog__close',
                '.el-drawer__close-btn',
                '.close',
                '[class*="close"]',
                '[aria-label*="关闭"]',
                '[title*="关闭"]'
            ];

            for (const selector of closeSelectors) {
                const btn = document.querySelector(selector);
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                    await sleep(250);
                    return;
                }
            }

            // 回退方案：发送 ESC
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true,
                cancelable: true
            }));
            await sleep(200);
        };

        const extractDirectlyFromItem = (item, fileName) => {
            let candidates = [];
            
            // 🔍 尝试从 Vue 实例获取数据
            if (item.__vue__) {
                appLogger.info(`🎯 [Vue检测] ${fileName} - 发现 Vue 实例，尝试提取数据...`);
                const vueData = item.__vue__;
                
                // 尝试多种可能的数据路径
                const possiblePaths = [
                    vueData.$attrs,
                    vueData.$props,
                    vueData.$data,
                    vueData.fileUrl,
                    vueData.url,
                    vueData.downloadUrl,
                    vueData.previewUrl,
                    vueData.attachment,
                    vueData.file
                ];
                
                appLogger.info(`🔍 [Vue数据] ${fileName} - Vue 实例键: ${Object.keys(vueData).slice(0, 20).join(', ')}`);
                
                // 🎯 深度搜索Vue实例中的URL
                const extractUrlsFromObject = (obj, depth = 0) => {
                    if (depth > 3 || !obj || typeof obj !== 'object') return [];
                    const urls = [];
                    for (const key of Object.keys(obj)) {
                        const value = obj[key];
                        if (typeof value === 'string' && (
                            value.startsWith('http') || 
                            value.startsWith('//') || 
                            key.toLowerCase().includes('url') ||
                            key.toLowerCase().includes('file')
                        )) {
                            const normalized = normalizeUrl(value);
                            if (normalized && isUsefulFileUrl(normalized)) {
                                appLogger.info(`🎯 [Vue提取] 从 ${key} 找到URL: ${normalized.substring(0, 80)}`);
                                urls.push(normalized);
                            }
                        } else if (typeof value === 'object' && value !== null) {
                            urls.push(...extractUrlsFromObject(value, depth + 1));
                        }
                    }
                    return urls;
                };
                
                const vueUrls = extractUrlsFromObject(vueData);
                if (vueUrls.length > 0) {
                    appLogger.info(`✅ [Vue提取] 从Vue实例提取到 ${vueUrls.length} 个URL`);
                    candidates.push(...vueUrls);
                }
            }
            
            // 🔍 检查所有 data-* 属性
            const dataAttrs = {};
            for (const attr of item.attributes) {
                if (attr.name.startsWith('data-')) {
                    dataAttrs[attr.name] = attr.value;
                    // 尝试提取URL
                    const normalized = normalizeUrl(attr.value);
                    if (normalized && isUsefulFileUrl(normalized)) {
                        appLogger.info(`🎯 [Data属性] 从 ${attr.name} 找到URL: ${normalized.substring(0, 80)}`);
                        candidates.push(normalized);
                    }
                }
            }
            if (Object.keys(dataAttrs).length > 0) {
                appLogger.info(`🔍 [数据属性] ${fileName} - data-* 属性:`, dataAttrs);
            }
            
            const candidateElements = [
                item,
                item.querySelector('a[href]'),
                item.closest('a[href]'),
                item.querySelector('[data-url]'),
                item.querySelector('[data-file-url]'),
                item.querySelector('[data-download-url]'),
                // 🚫 排除图标src：避免提取 <img class="file-icon" src="...icon.png">
                item.querySelector('video[src], audio[src], source[src], embed[src]'),
                // 🚫 避免提取img的icon src，只从其他元素提取src
                item.querySelector('[src]:not(.file-icon):not([class*="icon"])')
            ].filter(Boolean);

            candidateElements.forEach((el) => {
                const rawValues = [
                    el.getAttribute?.('href'),
                    el.getAttribute?.('data-url'),
                    el.getAttribute?.('data-file-url'),
                    el.getAttribute?.('data-download-url'),
                    el.getAttribute?.('src')
                ];
                rawValues.forEach((raw) => {
                    let normalized = normalizeUrl(raw);
                    
                    // 🔓 如果是预览链接，提取真实下载URL
                    if (normalized && normalized.includes('polymas.com/resource/preview')) {
                        normalized = extractRealUrlFromPreview(normalized);
                    }
                    
                    if (isUsefulFileUrl(normalized)) candidates.push(normalized);
                });
            });
            
            // 🔍 调试日志：显示直接提取的结果
            if (candidates.length === 0) {
                appLogger.info(`📎 [直接提取] ${fileName} - 从 DOM 直接提取没有找到有用的 URL`);
                // 显示这个 item 元素本身的信息
                appLogger.info(`  元素类型: ${item.tagName}`);
                appLogger.info(`  元素 class: ${item.className}`);
                appLogger.info(`  元素内容: ${item.textContent.substring(0, 100)}`);
            } else {
                appLogger.info(`✅ [直接提取] ${fileName} - 找到 ${candidates.length} 个候选URL`);
            }

            return pickBestUrl(candidates, fileName);
        };

        const extractViaClickPreview = async (item, fileName, index) => {
            try {
                // 🎯 优先检查缓存：如果已经有了，就不需要点击跳转新标签页
                const normalizedCurrentName = normalizePreviewName(fileName);
                const cachedResult = (window._zhsPreviewFileResults || []).find(result => {
                    if (!result?.fileName || !result?.fileUrl) return false;
                    return isLikelySamePreviewName(result.fileName, normalizedCurrentName);
                });
                
                if (cachedResult?.fileUrl) {
                    appLogger.info(`✅ [缓存命中] ${fileName} - 无需点击，直接使用缓存URL`);
                    appLogger.info(`   缓存文件名: ${cachedResult.fileName}`);
                    appLogger.info(`   缓存URL: ${cachedResult.fileUrl.substring(0, 80)}...`);
                    return cachedResult.fileUrl;
                }
                
                appLogger.info(`🔍 [缓存未命中] ${fileName} - 需要点击提取，当前缓存数: ${(window._zhsPreviewFileResults || []).length}`);
                
                const dispatchRealClick = (element) => {
                    if (!element) return;

                    // 更接近真实用户操作：完整鼠标事件序列
                    const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
                    for (const type of mouseEvents) {
                        element.dispatchEvent(new MouseEvent(type, {
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                            view: window,
                            button: 0
                        }));
                    }
                };

                const beforeUrl = window.location.href;
                const beforeCandidates = collectCandidateUrls(document);
                const interceptedBefore = (window._zhsInterceptedPreviewUrls || []).length;
                const previewResultsBefore = (window._zhsPreviewFileResults || []).length;
                appLogger.info(`📎 [自动点击] ${fileName} - 点击前：${beforeCandidates.length} 个 URL 候选`);
                appLogger.info(`📎 [自动点击] ${fileName} - 点击前已拦截 ${interceptedBefore} 个preview URL`);

                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(250);

                // 🎯 严格在当前 file-item 内定位点击目标，避免误触发到其他附件
                let clickTarget = null;
                // normalizedCurrentName 已在函数开头定义

                // 优先级1: 当前 item 内，文本与文件名标准化后完全一致的元素
                const exactNameElement = Array.from(item.querySelectorAll('.box, .line1, [title], span, div')).find((el) => {
                    const text = String(el.textContent || '');
                    return !!text && isLikelySamePreviewName(text, normalizedCurrentName);
                });
                if (exactNameElement) {
                    clickTarget = exactNameElement;
                    appLogger.info(`📎 [自动点击] ${fileName} - 命中精确文件名元素: <${exactNameElement.tagName}>.${exactNameElement.className}`);
                }

                // 优先级2: 当前 item 内 link 元素
                if (!clickTarget) {
                    const linkElement = item.querySelector('a');
                    if (linkElement) {
                        clickTarget = linkElement;
                        appLogger.info(`📎 [自动点击] ${fileName} - 找到link元素: <a> 标签`);
                    }
                }

                // 优先级3: 当前 item 内最常见点击区
                if (!clickTarget) {
                    clickTarget = item.querySelector('.box, .line1');
                    if (clickTarget) {
                        appLogger.info(`📎 [自动点击] ${fileName} - 使用默认点击区域`);
                    }
                }

                // 最后才用 item 本身
                if (!clickTarget) {
                    clickTarget = item;
                    appLogger.info(`📎 [自动点击] ${fileName} - 使用item本身作为点击目标`);
                }

                // 仅允许当前 item 内部节点，禁止父级/同级节点，避免打开错误附件
                const clickCandidateChain = [];
                const addCandidate = (el) => {
                    if (!el || clickCandidateChain.includes(el)) return;
                    if (el !== item && !item.contains(el)) return;
                    clickCandidateChain.push(el);
                };
                addCandidate(clickTarget);
                addCandidate(item.querySelector('.box'));
                addCandidate(item.querySelector('.line1'));
                addCandidate(item);

                const logClickSnapshot = (stage, attempt = 0) => {
                    try {
                        const visibleDialogs = Array.from(document.querySelectorAll('.el-dialog__wrapper, .el-drawer__wrapper, [role="dialog"], .modal'))
                            .filter((el) => el && el.offsetParent !== null);
                        const iframes = document.querySelectorAll('iframe').length;
                        const previews = (window._zhsPreviewFileResults || []).length;
                        const intercepted = (window._zhsInterceptedPreviewUrls || []).length;
                        const activeTag = document.activeElement?.tagName || 'N/A';
                        const candidateSummary = clickCandidateChain
                            .map((el) => `<${String(el.tagName || '').toLowerCase()}>.${String(el.className || '').trim()}`)
                            .slice(0, 4)
                            .join(' | ');

                        appLogger.debug(`🧭 [点击快照] ${fileName} | ${stage}${attempt ? `#${attempt}` : ''}`, {
                            index,
                            urlChanged: window.location.href !== beforeUrl,
                            visibleDialogs: visibleDialogs.length,
                            iframes,
                            previewCacheSize: previews,
                            interceptedCount: intercepted,
                            activeElement: activeTag,
                            candidates: candidateSummary || '(empty)'
                        });
                    } catch (e) {
                        appLogger.debug(`⚠️ [点击快照] 记录失败: ${e.message}`);
                    }
                };

                const triggerClickCandidates = (reason) => {
                    appLogger.info(`🖱️ [自动点击] ${fileName} - 触发候选点击(${reason})，候选数: ${clickCandidateChain.length}`);
                    for (const candidate of clickCandidateChain) {
                        if (!candidate) continue;
                        dispatchRealClick(candidate);
                        try {
                            candidate.click();
                        } catch (e) {
                            appLogger.info(`⚠️ [自动点击] ${fileName} - 点击候选失败: ${candidate.tagName}.${candidate.className}`);
                        }
                    }
                };
                
                // 🎯 使用真实的 .click() 方法而不是 dispatchEvent（浏览器更可能允许导航）
                appLogger.info(`📎 [自动点击] ${fileName} - 准备点击元素: ${clickTarget.tagName}.${clickTarget.className}`);
                appLogger.info(`📎 [自动点击] ${fileName} - 元素文本内容: ${clickTarget.textContent.substring(0, 50)}`);
                logClickSnapshot('首次点击前');

                // 先触发一次真实事件序列，再调用click，提升跳转触发概率
                triggerClickCandidates('首次');
                appLogger.info(`📎 [自动点击] ${fileName} - 已调用 .click() 方法`);
                logClickSnapshot('首次点击后');
                
                // 等待Preview页面处理完成（如果前一个文件还在处理）
                let waitCount = 0;
                while (window._zhsPreviewProcessing && waitCount < 5) {
                    await sleep(200);
                    waitCount++;
                }
                if (waitCount > 0) {
                    appLogger.info(`⏳ [Preview页面] 等待前一个文件处理完成 (${waitCount}次)`);
                }

                // 等待预览弹层或新内容加载后再抓取链接
                let captured = null;
                let noProgressCount = 0;
                const expectedExt = getExpectedExtFromFileName(fileName);
                for (let attempt = 1; attempt <= 20; attempt++) {  // 增加到20次，确保足够时间打开Preview
                    await sleep(500);  // 增加到500ms，总等待时间10秒

                    if ([1, 4, 8, 12, 16].includes(attempt)) {
                        logClickSnapshot('轮询检测', attempt);
                    }

                    // 先尝试命中新产生的 preview 缓存（兼容 preview 侧文件名异常）
                    if (!captured) {
                        const previewResultsNow = window._zhsPreviewFileResults || [];
                        if (previewResultsNow.length > previewResultsBefore) {
                            const newPreviewResults = previewResultsNow.slice(previewResultsBefore);
                            const exactMatch = newPreviewResults.find((result) => {
                                if (!result?.fileName) return false;
                                const normalizedResultName = String(result.fileName || '');
                                return isLikelySamePreviewName(normalizedResultName, normalizedCurrentName);
                            });

                            if (exactMatch?.fileUrl) {
                                appLogger.info(`✅ [Preview通信] 第${attempt}次尝试：命中新缓存(精确匹配)`);
                                captured = exactMatch.fileUrl;
                                break;
                            }

                            const relaxedMatch = newPreviewResults.find((result) => {
                                const url = String(result?.fileUrl || '').toLowerCase();
                                if (!url || !/^https?:\/\//i.test(url)) return false;
                                if (expectedExt && !url.includes(expectedExt)) return false;
                                return url.includes('file.zhihuishu.com') || url.includes('aliyuncs.com') || url.includes('polymas');
                            });

                            if (relaxedMatch?.fileUrl) {
                                appLogger.info(`✅ [Preview通信] 第${attempt}次尝试：命中新缓存(宽松匹配)`);
                                captured = relaxedMatch.fileUrl;
                                break;
                            }
                        }
                    }

                    // 前几轮做一次强制补点，减少“首次点击没触发”的概率
                    if (!captured && [2, 4].includes(attempt)) {
                        triggerClickCandidates(`强制补点${attempt}`);
                    }

                    if (!captured && [3, 6, 10, 14].includes(attempt)) {
                        const noNewIntercepted = (window._zhsInterceptedPreviewUrls || []).length === interceptedBefore;
                        const noRouteChange = window.location.href === beforeUrl;
                        const normalizedFileName = normalizePreviewName(fileName);
                        const hasMatchedPreviewMessage = !!(window._zhsPreviewFileResults || []).find((result) => {
                            if (!result?.fileName) return false;
                            return isLikelySamePreviewName(result.fileName, normalizedFileName);
                        });
                        if (noNewIntercepted && noRouteChange && !hasMatchedPreviewMessage) {
                            triggerClickCandidates(`重试${attempt}`);
                        }
                    }

                    // 优先检查preview页面通信（最快）
                    if (!captured && window._zhsPreviewFileResults && window._zhsPreviewFileResults.length > 0) {
                        const normalizedFileName = normalizePreviewName(fileName);
                        const matchedResult = window._zhsPreviewFileResults.find(result => {
                            if (!result.fileName) return false;
                            return isLikelySamePreviewName(result.fileName, normalizedFileName);
                        });
                        
                        if (matchedResult) {
                            appLogger.info(`✅ [Preview通信] 第${attempt}次尝试：找到匹配文件 "${matchedResult.fileName}"`);
                            
                            // 记录分析结果（如果有）
                            if (matchedResult.analysis) {
                                appLogger.info(`📊 [文件分析] 已识别到分析结果:`, {
                                    title: matchedResult.analysis.title,
                                    hasQuestions: matchedResult.analysis.structure.hasQuestions,
                                    questionCount: matchedResult.analysis.questions?.length || 0,
                                    hasAnswers: matchedResult.analysis.structure.hasAnswers,
                                    answerCount: matchedResult.analysis.answers?.length || 0
                                });
                                
                                // 在日志中展示部分内容
                                if (matchedResult.analysis.questions?.length > 0) {
                                    appLogger.info(`📝 [文件分析] 第1个题目: ${matchedResult.analysis.questions[0].substring(0, 100)}...`);
                                }
                                if (matchedResult.analysis.answers?.length > 0) {
                                    appLogger.info(`✅ [文件分析] 第1个答案: ${matchedResult.analysis.answers[0].substring(0, 100)}...`);
                                }
                            }
                            
                            captured = matchedResult.fileUrl;
                            break;
                        }
                    }

                    // 检查window.open拦截
                    if (!captured) {
                        const interceptedAfter = (window._zhsInterceptedPreviewUrls || []).length;
                        if (interceptedAfter > interceptedBefore) {
                            const newIntercepted = window._zhsInterceptedPreviewUrls.slice(interceptedBefore);
                            for (const item of newIntercepted) {
                                if (item.decodedUrl) {
                                    appLogger.info(`✅ [window.open拦截] 第${attempt}次尝试：使用解码URL`);
                                    captured = item.decodedUrl;
                                    break;
                                }
                            }
                            if (captured) break;
                        }
                    }

                    // 🎯 检测页面是否跳转到预览页面
                    const currentUrl = window.location.href;
                    const interceptedNow = (window._zhsInterceptedPreviewUrls || []).length;
                    const noRouteChangeNow = currentUrl === beforeUrl;
                    const noInterceptGrowth = interceptedNow === interceptedBefore;
                    
                    // 🔍 每次尝试都记录当前 URL（用于诊断）
                    if (attempt === 1 || currentUrl !== beforeUrl) {
                        appLogger.info(`🌐 [URL检测] 第${attempt}次：${currentUrl === beforeUrl ? '未跳转' : '已跳转'}`);
                        if (currentUrl !== beforeUrl) {
                            appLogger.info(`   原始URL: ${beforeUrl.substring(0, 60)}...`);
                            appLogger.info(`   当前URL: ${currentUrl.substring(0, 60)}...`);
                        }
                    }
                    
                    // ✅ 处理页面跳转到预览页面的情况
                    if (currentUrl !== beforeUrl && currentUrl.includes('polymas.com/resource/preview')) {
                        appLogger.info(`📍 [URL跳转] 检测到跳转至预览页面: ${currentUrl.substring(0, 80)}...`);
                        const realUrl = extractRealUrlFromPreview(currentUrl);
                        if (realUrl && realUrl !== currentUrl) {
                            captured = realUrl;
                            appLogger.info(`✅ [附件URL] ${fileName} - 从预览页面提取成功(第${attempt}次尝试)`);
                            break;
                        }
                    }

                    // 🔍 检测是否有预览弹窗打开（而非页面跳转）
                    // 查找dialog、modal或iframe中的polymas预览URL
                    const detectPreviewModal = () => {
                        // 先检查所有iframe的src属性
                        const allIframes = document.querySelectorAll('iframe');
                        appLogger.info(`📊 [iframe统计] 页面共有 ${allIframes.length} 个iframe`);
                        
                        const previewSelectors = [
                            '.el-dialog__wrapper iframe[src*="polymas.com"]',
                            '.el-drawer__wrapper iframe[src*="polymas.com"]',
                            'iframe[src*="resource/preview"]',
                            '.modal iframe[src*="polymas.com"]',
                            '[role="dialog"] iframe[src*="polymas.com"]',
                            'iframe[src*="polymas"]'  // 广泛匹配
                        ];
                        
                        for (const selector of previewSelectors) {
                            const preview = document.querySelector(selector);
                            if (preview && preview.src) {
                                const previewUrl = normalizeUrl(preview.src);
                                if (previewUrl && previewUrl.includes('polymas.com')) {
                                    appLogger.info(`🔍 [弹窗检测] 发现预览iframe: ${previewUrl.substring(0, 80)}`);
                                    return previewUrl;
                                }
                            }
                        }
                        
                        // 扫描所有iframe src
                        for (const iframe of allIframes) {
                            if (iframe.src && iframe.src.includes('polymas.com')) {
                                const previewUrl = normalizeUrl(iframe.src);
                                if (previewUrl) {
                                    appLogger.info(`🔍 [弹窗检测] 从iframe扫描发现: ${previewUrl.substring(0, 80)}`);
                                    return previewUrl;
                                }
                            }
                        }
                        
                        // 查找HTML中隐藏的预览URL
                        const PageHtml = document.documentElement.outerHTML;
                        const previewUrlMatch = PageHtml.match(/resource\/preview[^"'<>]*u=[^"'<>]+/i);
                        if (previewUrlMatch) {
                            const previewUrl = normalizeUrl('https://' + previewUrlMatch[0]);
                            if (previewUrl) {
                                appLogger.info(`🔍 [弹窗检测] 从HTML提取预览URL: ${previewUrl.substring(0, 80)}`);
                                return previewUrl;
                            }
                        }
                        
                        return null;
                    };
                    
                    const modalPreviewUrl = detectPreviewModal();
                    if (modalPreviewUrl && attempt <= 5) {
                        appLogger.info(`📍 [弹窗追踪] 第${attempt}次检测到弹窗预览，尝试提取真实URL...`);
                        const realUrl = extractRealUrlFromPreview(modalPreviewUrl);
                        if (realUrl && realUrl !== modalPreviewUrl && realUrl.startsWith('http')) {
                            captured = realUrl;
                            appLogger.info(`✅ [附件URL] ${fileName} - 从弹窗预览提取成功(第${attempt}次尝试)`);
                            appLogger.info(`   解码后URL: ${realUrl.substring(0, 100)}`);
                            break;
                        }
                    }

                    const currentCandidates = collectCandidateUrls(document);
                    appLogger.info(`📎 [自动点击] ${fileName} - 第${attempt}次尝试：${currentCandidates.length} 个 URL`);
                    
                    const newOnes = currentCandidates.filter(url => !beforeCandidates.includes(url));
                    if (newOnes.length > 0) {
                        noProgressCount = 0;
                        appLogger.info(`📎 [自动点击] ${fileName} - 发现 ${newOnes.length} 个新 URL`);
                        newOnes.forEach((url, i) => {
                            appLogger.info(`  ${i + 1}. ${url.substring(0, 100)}`);
                        });
                        
                        // ✅ 优先从新出现的URL中选择
                        captured = pickBestUrl(newOnes, fileName);
                        if (captured) {
                            appLogger.info(`✅ [附件URL] ${fileName} - 自动点击提取成功(第${attempt}次尝试，来自新URL)`);
                            break;
                        }
                    } else if (noRouteChangeNow && noInterceptGrowth) {
                        noProgressCount++;
                    }

                    // 对非首个附件，若多轮无进展则尽快退出，交给免跳转候选池兜底，避免卡20轮。
                    if (!captured && index > 0 && attempt >= 8 && noProgressCount >= 4) {
                        logClickSnapshot('提前退出前', attempt);
                        appLogger.info(`⏭️ [自动点击] ${fileName} - 连续无进展，提前退出点击循环，转入免跳转兜底`);
                        break;
                    }
                    
                    // 不再从“原有页面URL池”兜底，避免把附件误识别为PNG图标
                    if (attempt >= 7 && newOnes.length === 0) {
                        appLogger.info(`📎 [自动点击] ${fileName} - 第${attempt}次尝试：无新URL，继续等待真实预览跳转/弹窗`);
                        appLogger.info(`   当前URL总数: ${currentCandidates.length}`);
                        appLogger.info(`   页面状态: URL${currentUrl === beforeUrl ? '未' : '已'}跳转`);
                    }
                }

                // 循环结束后，如果仍未找到，最后再检查一次window.open拦截和preview通信
                if (!captured) {
                    // 给Preview页面额外的时间来处理和发送结果
                    appLogger.info(`⏳ [最终等待] ${fileName} - 循环结束，等待Preview页面最终响应...`);
                    for (let finalWait = 1; finalWait <= 5; finalWait++) {
                        await sleep(300);
                        
                        // 再次检查preview页面通信
                        if (window._zhsPreviewFileResults && window._zhsPreviewFileResults.length > 0) {
                            const normalizedFileName = normalizePreviewName(fileName);
                            const matchedResult = window._zhsPreviewFileResults.find(result => {
                                if (!result.fileName) return false;
                                return isLikelySamePreviewName(result.fileName, normalizedFileName);
                            });
                            if (matchedResult) {
                                captured = matchedResult.fileUrl;
                                appLogger.info(`✅ [附件URL] ${fileName} - 最终检查时找到匹配文件`);
                                break;
                            }
                        }
                    }
                    
                    // 检查window.open拦截
                    if (!captured) {
                        const interceptedAfter = (window._zhsInterceptedPreviewUrls || []).length;
                        if (interceptedAfter > interceptedBefore) {
                            const newIntercepted = window._zhsInterceptedPreviewUrls.slice(interceptedBefore);
                            appLogger.info(`📎 [最终检查] 发现 ${newIntercepted.length} 个window.open拦截URL`);
                            
                            for (const item of newIntercepted) {
                                if (item.decodedUrl) {
                                    captured = item.decodedUrl;
                                    appLogger.info(`✅ [附件URL] ${fileName} - 从window.open拦截提取成功（最终检查）`);
                                    break;
                                }
                            }
                        }
                    }
                }

                // 最终诊断信息
                if (!captured && window._zhsPreviewFileResults && window._zhsPreviewFileResults.length > 0) {
                    appLogger.warn(`⚠️ [Preview通信] 循环结束但未匹配，当前文件名: "${fileName}"`);
                    appLogger.info(`📎 [Preview通信] 缓存中的文件列表:`);
                    window._zhsPreviewFileResults.forEach((result, idx) => {
                        appLogger.info(`  ${idx + 1}. "${result.fileName}" -> ${result.fileUrl?.substring(0, 80)}`);
                    });
                }

                // 某些站点会跳详情路由，尝试从地址栏取链接
                if (!captured && window.location.href !== beforeUrl) {
                    const currentUrl = window.location.href;
                    appLogger.info(`🌐 [路由跳转] 页面跳转到新URL: ${currentUrl.substring(0, 100)}`);
                    
                    // 🔓 特别处理 polymas 预览链接
                    if (currentUrl.includes('polymas.com/resource/preview')) {
                        appLogger.info(`📍 [预览页面] 检测到polymas预览URL，尝试解码真实文件URL...`);
                        const realUrl = extractRealUrlFromPreview(currentUrl);
                        if (realUrl && realUrl !== currentUrl && realUrl.startsWith('http')) {
                            captured = realUrl;
                            appLogger.info(`✅ [附件URL] ${fileName} - 从polymas预览页面成功解码: ${realUrl.substring(0, 100)}`);
                        }
                    } else {
                        // 其他跳转，尝试从地址栏取链接
                        const routeUrl = normalizeUrl(currentUrl);
                        if (isUsefulFileUrl(routeUrl)) {
                            captured = routeUrl;
                            appLogger.info(`✅ [附件URL] ${fileName} - 从页面URL提取成功`);
                        }
                    }
                }

                // 🔙 如果页面跳转了，需要返回原页面以处理下一个附件
                const currentUrl = window.location.href;
                if (currentUrl !== beforeUrl) {
                    appLogger.info(`🔙 [页面返回] 从预览页面返回原页面...`);
                    window.history.back();
                    await sleep(500);  // 等待页面加载
                }

                await closePreviewIfNeeded();
                await sleep(180);

                if (!captured) {
                    // 🔍 详细诊断日志：为什么没有找到URL？
                    const afterCandidates = collectCandidateUrls(document);
                    appLogger.warn(`❌ [附件URL] 自动点击后仍未提取到URL - ${fileName} (索引${index + 1})`);
                    appLogger.info(`   点击前 URL 数： ${beforeCandidates.length}`);
                    appLogger.info(`   最后一次尝试 URL 数： 不详（因为 captured 为 null）`);
                    appLogger.info(`   关闭预览后 URL 数： ${afterCandidates.length}`);
                    if (afterCandidates.length > 0) {
                        appLogger.info(`   关闭预览后找到的 URL:`);
                        afterCandidates.forEach((url, i) => {
                            appLogger.info(`     ${i + 1}. ${url.substring(0, 100)}`);
                        });
                    }
                }

                return captured;
            } catch (error) {
                appLogger.warn(`⚠️ [附件URL] 自动点击提取异常 - ${fileName}: ${error.message}`);
                return null;
            }
        };

        try {
            // 🎯 优先从题目区（.left-content）提取附件，避免误取学生答案区（.right-content）的文件
            const leftContent = document.querySelector('.left-content');
            const searchRoot = leftContent || document;
            const fileList = searchRoot.querySelector('.file-list');
            
            if (!fileList) {
                appLogger.info('📎 [附件URL提取] 未找到 .file-list 元素');
                return [];
            }
            
            if (leftContent) {
                appLogger.info('✅ [附件URL提取] 从 .left-content（题目区）提取附件');
            } else {
                appLogger.warn('⚠️ [附件URL提取] 未检测到 .left-content，从全局查找（可能混入学生答案）');
            }

            // 🔍 尝试从页面全局状态获取附件数据
            const globalStates = [
                window.__INITIAL_STATE__,
                window.__VUE_APP_STATE__,
                window.appState,
                window.pageData
            ];
            for (const state of globalStates) {
                if (state) {
                    appLogger.info(`🌐 [全局状态] 发现全局状态对象:`, Object.keys(state).slice(0, 10));
                    // 尝试找到附件相关的数据
                    const stateStr = JSON.stringify(state);
                    if (stateStr.includes('docx') || stateStr.includes('file') || stateStr.includes('attachment')) {
                        appLogger.info(`🎯 [全局状态] 可能包含附件信息`);
                    }
                }
            }

            const fileItems = Array.from(fileList.querySelectorAll('.file-item'));
            const attachmentUrls = [];
            const usedUrls = new Set();
            appLogger.info(`📎 [附件URL提取] 发现 ${fileItems.length} 个文件项`);

            const normalizeFileName = (name) => normalizePreviewName(name);

            // 无需跳转的兜底候选池：点击失败时按“未使用URL”分配，避免卡死在单文件成功。
            const pageFallbackCandidates = collectCandidateUrls(searchRoot).filter((url) => {
                const lower = String(url || '').toLowerCase();
                if (isImageLikeUrl(url)) return false;
                return lower.includes('aliyuncs.com') ||
                    lower.includes('polymas') ||
                    lower.includes('file.zhihuishu.com');
            });
            if (pageFallbackCandidates.length > 0) {
                appLogger.info(`📎 [免跳转兜底] 初始化候选池 ${pageFallbackCandidates.length} 个URL`);
            }

            // 批量预触发：尽量在同一用户手势窗口内把所有附件的preview都触发出来
            const preTriggerPreviewForAllFiles = async () => {
                // ⚠️ 已禁用此功能，避免自动点击导致页面跳转
                appLogger.info('⚠️ [预触发] 此功能已禁用');
                return;
                
                // 以下代码已停用
                if (fileItems.length <= 1) return;
                appLogger.info(`🖱️ [预触发] 开始批量预触发 ${fileItems.length} 个附件`);

                const dispatchRealClick = (element) => {
                    if (!element) return;
                    const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
                    for (const type of mouseEvents) {
                        element.dispatchEvent(new MouseEvent(type, {
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                            view: window,
                            button: 0
                        }));
                    }
                };

                for (let i = 0; i < fileItems.length; i++) {
                    const item = fileItems[i];
                    const name = item.querySelector('.box, .line1')?.textContent?.trim() || `附件_${i + 1}`;
                    const target = item.querySelector('.box, .line1, .file-item') || item;

                    try {
                        item.scrollIntoView({ behavior: 'instant', block: 'center' });
                        dispatchRealClick(target);
                        target.click();
                        appLogger.info(`🖱️ [预触发] 已触发: ${name}`);
                        await sleep(120);
                    } catch (e) {
                        appLogger.info(`⚠️ [预触发] 触发失败: ${name} - ${e.message}`);
                    }
                }

                await sleep(400);
                appLogger.info('🖱️ [预触发] 批量预触发完成');
            };

            // ⚠️ 禁用批量预触发功能，避免自动点击导致页面跳转
            // await preTriggerPreviewForAllFiles();
            appLogger.info('⚠️ [预触发] 已禁用批量预触发功能，避免页面跳转');

            for (let i = 0; i < fileItems.length; i++) {
                const item = fileItems[i];
                const fileName = item.querySelector('.box, .line1')?.textContent?.trim() || `附件_${i + 1}`;

                let fileUrl = extractDirectlyFromItem(item, fileName);
                let method = fileUrl ? '直接DOM提取' : null;

                // 优先命中 preview 页面已回传的结果，避免再次点击失败
                if (!fileUrl && window._zhsPreviewFileResults && window._zhsPreviewFileResults.length > 0) {
                    const normalizedFileName = normalizeFileName(fileName);
                    const matchedResult = window._zhsPreviewFileResults.find((result) => {
                        if (!result?.fileName) return false;
                        return isLikelySamePreviewName(result.fileName, normalizedFileName);
                    });

                    if (matchedResult?.fileUrl) {
                        fileUrl = matchedResult.fileUrl;
                        method = '预触发缓存命中';
                        appLogger.info(`✅ [附件URL] ${fileName} - 命中预触发缓存`);
                    }
                }

                if (!fileUrl) {
                    // ⚠️ 不再自动点击附件，避免打开预览页面
                    appLogger.info(`⚠️ [附件URL] ${fileName} - 未找到URL（已禁用自动点击）`);
                    // fileUrl = await extractViaClickPreview(item, fileName, i);
                    method = null;
                }

                // 若点击链路失败，直接从页面候选池取“未使用URL”兜底，减少对跳转的依赖。
                if (!fileUrl && pageFallbackCandidates.length > 0) {
                    const expectedExt = getExpectedExtFromFileName(fileName);
                    const fallbackCandidates = pageFallbackCandidates
                        .filter(url => !usedUrls.has(url))
                        .filter((url) => {
                            if (!expectedExt) return true;
                            const lower = String(url || '').toLowerCase();
                            // 文档场景：允许同扩展名，或无扩展名动态链接；拒绝图片链接。
                            if (isImageLikeUrl(url)) return false;
                            const pure = lower.split('?')[0].split('#')[0];
                            const hasAnyExt = /\.[a-z0-9]{2,5}$/i.test(pure);
                            return lower.includes(expectedExt) || !hasAnyExt;
                        });
                    const fallbackUrl = pickBestUrl(fallbackCandidates, fileName);
                    if (fallbackUrl) {
                        fileUrl = fallbackUrl;
                        method = '页面候选兜底(免跳转)';
                        appLogger.info(`✅ [附件URL] ${fileName} - 点击失败后启用免跳转兜底成功`);
                    }
                }

                // 避免不同附件拿到同一个URL，尝试从全局候选中选未使用的备选
                if (fileUrl && usedUrls.has(fileUrl)) {
                    const lowerFileName = String(fileName || '').toLowerCase();
                    const expectedExt = (lowerFileName.match(/\.(docx|doc|xlsx|xls|pptx|ppt|pdf|txt|zip)$/) || [])[0] || '';

                    const allCandidates = collectCandidateUrls(document)
                        .filter(url => !usedUrls.has(url))
                        .filter((url) => {
                            // 文件名有明确扩展名时，备选URL必须匹配扩展名
                            if (!expectedExt) return true;
                            return String(url || '').toLowerCase().includes(expectedExt);
                        });

                    const fallback = pickBestUrl(allCandidates, fileName);
                    if (fallback) {
                        appLogger.info(`🔁 [附件URL] ${fileName} - 检测到重复URL，已切换到备选URL`);
                        fileUrl = fallback;
                        method = `${method || '候选提取'}(去重备选)`;
                    } else {
                        appLogger.warn(`⚠️ [附件URL] ${fileName} - 候选URL与前一个重复，且无可用备选`);
                    }
                }

                if (fileUrl) {
                    attachmentUrls.push({ name: fileName, url: fileUrl, method });
                    usedUrls.add(fileUrl);
                    appLogger.info(`✅ [附件URL] ${fileName} - 通过"${method}"提取成功`);
                } else {
                    appLogger.warn(`❌ [附件URL] 所有提取方法失败 - ${fileName}`);
                }
            }

            appLogger.info(`✅ [附件URL提取] 完成，得到 ${attachmentUrls.length} 个URL`);
            const validCount = attachmentUrls.filter(a => a.url).length;
            appLogger.info(`  有效URL: ${validCount}/${attachmentUrls.length}`);
            
            // 后置检查：如果结果不完整，给 preview 页面更多时间回传
            if (fileItems.length > 1 && attachmentUrls.length < fileItems.length) {
                appLogger.info(`⏳ [附件URL提取] 后置检查启动：期望 ${fileItems.length} 个文件，仅得到 ${attachmentUrls.length} 个，等待延迟的 preview 回传...`);
                appLogger.info(`   当前缓存结果数: ${window._zhsPreviewFileResults?.length || 0}`);
                
                for (let waitIdx = 1; waitIdx <= 20; waitIdx++) {
                    await sleep(300);

                    // 定期从共享存储回读，补偿 opener 通知漏接
                    if (waitIdx === 1 || waitIdx % 2 === 0) {
                        await pullSharedPreviewResultsFromStorage(`后置检查第${waitIdx}轮`);
                    }
                    
                    const cacheLen = window._zhsPreviewFileResults?.length || 0;
                    const needMin = fileItems.length;
                    
                    if (cacheLen >= needMin && attachmentUrls.length < fileItems.length) {
                        appLogger.info(`✅ [附件URL提取] 后置检查第 ${waitIdx} 轮命中：缓存已有 ${cacheLen} 个结果（期望 ≥${needMin}）`);
                        
                        const missingItems = fileItems.filter((item, idx) => {
                            const name = item.querySelector('.box, .line1')?.textContent?.trim() || `附件_${idx + 1}`;
                            const normalized = normalizeFileName(name);
                            const found = attachmentUrls.find(au => {
                                return isLikelySamePreviewName(au.name, normalized);
                            });
                            return !found;
                        });
                        
                        appLogger.info(`   缺失文件数: ${missingItems.length}`);
                        
                        for (const missingItem of missingItems) {
                            const fileName = missingItem.querySelector('.box, .line1')?.textContent?.trim() || `附件_${fileItems.indexOf(missingItem) + 1}`;
                            const normalizedName = normalizeFileName(fileName);
                            const expectedExt = getExpectedExtFromFileName(fileName);
                            
                            appLogger.info(`   尝试匹配: "${fileName}" (ext: "${expectedExt}")`);
                            
                            const matchedResult = window._zhsPreviewFileResults.find((result) => {
                                if (!result?.fileName) return false;
                                const nameMatch = isLikelySamePreviewName(result.fileName, normalizedName);
                                const extMatch = expectedExt && result?.fileUrl && result.fileUrl.includes(expectedExt) && (result.fileUrl.includes('file.zhihuishu.com') || result.fileUrl.includes('aliyuncs.com'));
                                return nameMatch || extMatch;
                            });
                            
                            if (matchedResult?.fileUrl) {
                                attachmentUrls.push({ 
                                    name: fileName, 
                                    url: matchedResult.fileUrl, 
                                    method: '后置 Preview 缓存匹配' 
                                });
                                appLogger.info(`✅       成功匹配: ${fileName} -> ${matchedResult.fileUrl.substring(0, 80)}...`);
                                break;
                            } else {
                                appLogger.info(`⚠️       未找到匹配`);
                            }
                        }
                        
                        if (attachmentUrls.length >= fileItems.length) {
                            appLogger.info(`✅ [附件URL提取] 后置检查完成：已补齐所有附件 (${attachmentUrls.length}/${fileItems.length})`);
                            break;
                        }
                    }
                    
                    if (waitIdx % 5 === 0) {
                        appLogger.debug(`   [后置检查] 第 ${waitIdx} 轮等待中... 缓存: ${cacheLen}/${needMin}`);
                    }
                }
                
                if (attachmentUrls.length < fileItems.length) {
                    appLogger.info(`⏳ [附件URL提取] 后置检查结束，仍缺少 ${fileItems.length - attachmentUrls.length} 个文件`);
                }
            }
            
            // 🔍 诊断：如果完全没有 URL，显示页面信息
            if (attachmentUrls.length === 0 && fileItems.length > 0) {
                appLogger.warn('⚠️ [附件URL诊断] 虽然找到了 ' + fileItems.length + ' 个文件项，但都没有提取到 URL');
                appLogger.info('📎 [页面诊断] 第一个文件项的 HTML 结构：');
                const firstItem = fileItems[0];
                appLogger.info('  tagName: ' + firstItem.tagName);
                appLogger.info('  className: ' + firstItem.className);
                appLogger.info('  HTML: ' + firstItem.outerHTML.substring(0, 300));
                appLogger.info('📎 [页面诊断] 页面上所有链接（<a> 标签）：');
                const allLinks = document.querySelectorAll('a[href]');
                let linkCount = 0;
                allLinks.forEach((link) => {
                    if (linkCount < 20) {  // 只显示前 20 个
                        appLogger.info(`  ${linkCount + 1}. ${link.href}`);
                        linkCount++;
                    }
                });
                if (allLinks.length > 20) {
                    appLogger.info(`  ... 还有 ${allLinks.length - 20} 个链接`);
                }
            }
            
            return attachmentUrls;
        } catch (e) {
            appLogger.error('❌ [附件URL提取] 异常:', e);
            return [];
        }
    }
    
    // 启动作业分析（从悬浮球触发）
    async function startHomeworkAnalysis() {
        appLogger.info('🖱️ [作业分析] 从悬浮球启动分析...');
        
        const currentUrl = window.location.href;
        const isHomeworkOrExamDetailsPage = currentUrl.includes('/homeworkDetails') || 
                                           currentUrl.includes('/homework/details') ||
                                           currentUrl.includes('/homework/detail') ||
                                           currentUrl.includes('pre-space-hike/homeworkDetails') ||
                                           currentUrl.includes('/examDetails') ||
                                           currentUrl.includes('/exam/details') ||
                                           currentUrl.includes('/exam/detail') ||
                                           currentUrl.includes('pre-space-hike/examDetails');
        
        if (!isHomeworkOrExamDetailsPage) {
            showNotification('⚠️ 请先进入作业或考试详情页面', '#FF9800');
            appLogger.warn('⚠️ [作业分析] 当前不在作业/考试详情页面，无法分析');
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
            
            // 处理附件（如果有）
            if (homeworkDetails.attachments && homeworkDetails.attachments.length > 0) {
                appLogger.info('📎 [作业分析] 开始处理附件...');
                showNotification('📎 处理附件中...', '#2196F3');
                
                try {
                    // 提取附件URL
                    appLogger.info('📎 [作业分析] 开始提取附件URL...');
                    const attachmentData = await extractAttachmentUrls();
                    appLogger.info(`📎 [作业分析] 提取完成，得到 ${attachmentData.length} 个结果`);
                    
                    const validUrls = attachmentData.filter(a => a.url);
                    appLogger.info(`📎 [作业分析] 有效URL: ${validUrls.length} 个`);
                    
                    if (validUrls.length > 0) {
                        appLogger.info(`📎 [作业分析] 准备下载 ${validUrls.length} 个附件`);
                        
                        // 🔍 详细日志：打印实际URL
                        validUrls.forEach((urlObj, idx) => {
                            appLogger.info(`📎 [URL${idx + 1}] 名称: ${urlObj.name}`);
                            appLogger.info(`📎 [URL${idx + 1}] 地址: ${urlObj.url}`);
                            appLogger.info(`📎 [URL${idx + 1}] 方法: ${urlObj.method}`);
                        });
                        
                        // 发送给background.js下载和解析
                        appLogger.info('📎 [作业分析] 发送消息给background.js开始下载...');
                        const parseResult = await new Promise((resolve) => {
                            chrome.runtime.sendMessage({
                                action: 'downloadAttachments',
                                urls: validUrls
                            }, (response) => {
                                appLogger.info('📎 [作业分析] 收到background.js响应');
                                appLogger.debug('   response:', response);
                                appLogger.debug('   success:', response?.success);
                                appLogger.debug('   attachments长度:', response?.attachments?.length);
                                
                                if (chrome.runtime.lastError) {
                                    appLogger.warn('⚠️ [作业分析] 附件处理通信失败:', chrome.runtime.lastError);
                                    resolve([]);
                                } else if (response && response.success) {
                                    appLogger.info('✅ [作业分析] 附件处理完成');
                                    const attachments = response.attachments || [];
                                    appLogger.info(`📎 [作业分析] 返回 ${attachments.length} 个附件`);
                                    resolve(attachments);
                                } else {
                                    appLogger.warn('⚠️ [作业分析] 附件处理返回失败:', response?.error);
                                    resolve([]);
                                }
                            });
                        });
                        
                        // 合并附件内容到分析数据
                        appLogger.info(`📎 [作业分析] parseResult.length = ${parseResult.length}`);
                        if (parseResult.length > 0) {
                            appLogger.info('✅ [作业分析] 进入合并逻辑');
                            homeworkDetails.attachmentContents = parseResult;
                            
                            // 🔍 详细日志：检查每个附件的实际内容
                            parseResult.forEach((att, idx) => {
                                appLogger.info(`📎 [附件${idx + 1}] 文件名: ${att.fileName}`);
                                appLogger.info(`📎 [附件${idx + 1}] 内容长度: ${att.content?.length || 0} 字符`);
                                appLogger.info(`📎 [附件${idx + 1}] 内容预览: ${att.content?.substring(0, 100) || '(无内容)'}`);
                                if (att.content && (att.content.includes('下载失败') || att.content.includes('解析失败') || att.content.includes('无法解析'))) {
                                    appLogger.warn(`⚠️ [附件${idx + 1}] 检测到错误信息: ${att.content}`);
                                }
                            });
                            
                            const fullContentSummary = parseResult
                                .map(a => `【${a.fileName}】\n${a.content || ''}`)
                                .join('\n\n');
                            const contentSummary = parseResult
                                .map(a => `【${a.fileName}】\n${a.content.substring(0, 200)}`)
                                .join('\n\n');
                            homeworkDetails.attachmentSummary = contentSummary;
                            homeworkDetails.attachmentSummaryFull = fullContentSummary;
                            appLogger.info(`📎 [作业分析] 附件内容已合并到分析数据`);
                            appLogger.info(`📎 [作业分析] 附件摘要长度: ${contentSummary.length} 字符`);
                        } else {
                            appLogger.warn(`⚠️ [作业分析] parseResult为空，无法获取附件内容`);
                        }
                    } else {
                        appLogger.info('⚠️ [作业分析] 无法获得有效的附件URL');
                    }
                } catch (e) {
                    appLogger.warn('⚠️ [作业分析] 附件处理异常:', e.message);
                    // 继续分析，不中断流程
                }
            }
            
            // 调用AI分析
            const analysis = await analyzeHomeworkWithAI(homeworkDetails);

            // 在结果面板中展示附件提取全文（题号/选项结构化）
            analysis.extractedAttachmentContents = Array.isArray(homeworkDetails.attachmentContents)
                ? homeworkDetails.attachmentContents
                : [];
            analysis.attachmentSummaryFull = homeworkDetails.attachmentSummaryFull || '';

            // 答案优先级：老师提供答案 > AI基于材料推导
            if (analysis && !analysis.referenceAnswer && homeworkDetails.teacherProvidedAnswer) {
                analysis.referenceAnswer = homeworkDetails.teacherProvidedAnswer;
                analysis.referenceAnswerType = 'objective';
                analysis.referenceAnswerSource = 'teacher';
                appLogger.info('🧩 [作业分析] 已用老师提供答案回填答案部分');
            }

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
    // 8. 作业详情分析功能
    // ==========================================
    // 注意：作业详情提取函数已迁移到 content-parser.js
    // 包括：extractHomeworkDetails, analyzeHomeworkWithAI 等

    // showAnalysisPanel 已提取到 src/content/content-analysis.js
    
    // ==========================================
    // 9.一键催交功能
    // ==========================================
    
    // 提取所有未交作业的学生（催交状态）
    async function detectUnsubmittedStudents() {
        appLogger.info('🔍 [一键催交] 开始检测未交作业的学生...');
        
        const allUnsubmittedStudents = [];
        const studentIdSet = new Set(); // 用学号去重
        const studentNameSet = new Set(); // 如果没有学号，用姓名去重
        
        // 1. 获取总页数
        const totalPages = getTotalPages();
        appLogger.info(`📄 [一键催交] 总页数: ${totalPages}`);
        
        // 2. 遍历每一页
        for (let page = 1; page <= totalPages; page++) {
            appLogger.info(`\n📖 [一键催交] 正在扫描第 ${page}/${totalPages} 页...`);
            
            // 如果不是第一页，需要点击翻页
            if (page > 1) {
                await goToPage(page);
                // goToPage 已包含智能等待，不需要额外延迟
            }
            
            // 提取当前页未交作业的学生
            const studentsOnPage = extractUnsubmittedStudentsFromCurrentPage();
            
            // 去重：只添加之前没有见过的学生
            let newStudents = 0;
            for (const student of studentsOnPage) {
                const uniqueKey = student.id !== '未知' ? student.id : student.name;
                const checkSet = student.id !== '未知' ? studentIdSet : studentNameSet;
                
                if (!checkSet.has(uniqueKey)) {
                    checkSet.add(uniqueKey);
                    allUnsubmittedStudents.push(student);
                    newStudents++;
                }
            }
            
            appLogger.info(`✅ [一键催交] 第 ${page} 页找到 ${studentsOnPage.length} 个学生，新增 ${newStudents} 个（去重后）`);
        }
        
        appLogger.info(`✅ [一键催交] 共检测到 ${allUnsubmittedStudents.length} 个未交作业的学生（已去重）`);
        return allUnsubmittedStudents;
    }
    
    // 从当前页面提取未交作业的学生
    function extractUnsubmittedStudentsFromCurrentPage() {
        const unsubmittedList = [];
        
        appLogger.info('🔍 [催交识别] 开始扫描当前页...');
        
        // 尝试多个选择器来找到学生行
        let rows = document.querySelectorAll('tbody tr.el-table__row');
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('table tbody tr');
        }
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('[class*=\"el-table__row\"]');
        }
        
        if (rows.length === 0) {
            appLogger.warn('⚠️ [催交识别] 未找到学生行！尝试的选择器都无效');
            appLogger.warn('  - tbody tr.el-table__row: 0');
            appLogger.warn('  - table tbody tr: 0');
            appLogger.warn('  - [class*="el-table__row"]: 0');
            return unsubmittedList;
        }
        
        appLogger.info(`📊 [催交识别] 找到 ${rows.length} 行学生数据，开始逐行分析...`);
        
        rows.forEach((row, index) => {
            try {
                const tds = row.querySelectorAll('td');
                if (tds.length === 0) {
                    return;
                }
                
                // 对前3行详细输出，帮助调试
                if (index < 3) {
                    appLogger.info(`\n🔍 [行${index}示例] 共 ${tds.length} 列:`);
                    tds.forEach((td, colIdx) => {
                        const text = td.textContent.trim();
                        if (text && text.length < 50) {
                            appLogger.info(`  列${colIdx}: ${text}`);
                        }
                    });
                }
                
                // 提取学生信息（更灵活的方式）
                let studentName = null;
                let studentId = null;
                let actionBtn = null;
                let hasUnsubmitted = false;
                
                // 遍历所有单元格，找到关键信息
                tds.forEach((td, colIndex) => {
                    const text = td.textContent.trim();
                    
                    // 查找"未交"文本（红色的未交状态）
                    if (text === '未交') {
                        hasUnsubmitted = true;
                        if (index < 3) appLogger.info(`  ✓ 列${colIndex}: 发现"未交"标记`);
                    }
                    
                    // 查找操作按钮（"催交"链接）优先级顺序：
                    // 1. base-button-component（正确的催交按钮）
                    let btn = td.querySelector('.base-button-component');
                    
                    // 2. 其他可能的按钮元素
                    if (!btn) {
                        btn = td.querySelector('span[class*="cursor-pointer"], span[class*="color"], button, a');
                    }
                    
                    // 3. 如果没有子元素，但td本身文本是"催交"，则使用td作为按钮
                    if (!btn && text === '催交') {
                        btn = td;
                        if (index < 3) appLogger.info(`  ✓ 列${colIndex}: 发现"催交"单元格（使用td作为按钮）`);
                    }
                    
                    if (btn) {
                        const btnText = btn.textContent.trim();
                        if (btnText === '催交') {
                            actionBtn = btn;
                            hasUnsubmitted = true;
                            if (index < 3) appLogger.info(`  ✓ 列${colIndex}: 发现"催交"按钮 (${btn.className || 'td元素'})`);
                        }
                    }
                    
                    // 简单的学号识别（纯数字，长度6-15位）
                    if (!studentId && /^\d{6,15}$/.test(text)) {
                        studentId = text;
                        if (index < 3) appLogger.info(`  ✓ 列${colIndex}: 学号 = ${studentId}`);
                    }
                    
                    // 学生姓名（中文2-4个字，不包含数字和特殊字符）
                    if (!studentName && /^[\u4e00-\u9fa5]{2,4}$/.test(text)) {
                        studentName = text;
                        if (index < 3) appLogger.info(`  ✓ 列${colIndex}: 姓名 = ${studentName}`);
                    }
                });
                
                // 如果没有找到姓名和学号，使用位置推断（兜底逻辑）
                if (!studentName && tds.length >= 2) {
                    // 姓名通常在第1或第2列
                    for (let i = 0; i < Math.min(3, tds.length); i++) {
                        const text = tds[i].textContent.trim();
                        if (/^[\u4e00-\u9fa5]{2,4}$/.test(text)) {
                            studentName = text;
                            if (index < 3) appLogger.info(`  ⚠️ 位置推断姓名(列${i}): ${studentName}`);
                            break;
                        }
                    }
                }
                
                if (!studentId && tds.length >= 3) {
                    // 学号通常在第2或第3列
                    for (let i = 1; i < Math.min(4, tds.length); i++) {
                        const text = tds[i].textContent.trim();
                        if (/^\d{6,15}$/.test(text)) {
                            studentId = text;
                            if (index < 3) appLogger.info(`  ⚠️ 位置推断学号(列${i}): ${studentId}`);
                            break;
                        }
                    }
                }
                
                // 判断是否未交
                if (hasUnsubmitted && studentName) {
                    unsubmittedList.push({
                        index: index,
                        name: studentName,
                        id: studentId || '未知',
                        element: row,
                        actionBtn: actionBtn
                    });
                    appLogger.info(`✅ [催交识别] 第${index}行: ${studentName} (${studentId || '未知'}) - 未交`);
                }
                
            } catch (error) {
                console.error(`❌ [催交识别] 解析第 ${index} 行失败:`, error);
            }
        });
        
        appLogger.info(`✅ [催交识别] 扫描完成，找到 ${unsubmittedList.length} 个未交学生`);
        return unsubmittedList;
    }
    
    // 执行一键催交流程
    async function executeOneClickRemind(studentList) {
        appLogger.info('🚀 [一键催交] 开始催交流程...');
        
            // 控制变量
            let isPaused = false;
            let isStopped = false;
            let currentIndex = 0;  // 添加索引追踪变量
        
        showFloatingPanel('批量催交进行中', '#FF9800', buildRemindProgressPanelHTML());
        
                // 绑定暂停/继续按钮
                const pauseBtn = document.getElementById('zh-remind-pause-btn');
                const stopBtn = document.getElementById('zh-remind-stop-btn');
        
                if (pauseBtn) {
                    pauseBtn.addEventListener('click', () => {
                        isPaused = !isPaused;
                        if (isPaused) {
                            pauseBtn.textContent = '▶ 继续';
                            pauseBtn.style.background = '#4CAF50';
                            appLogger.info('⏸ [一键催交] 已暂停');
                        } else {
                            pauseBtn.textContent = '⏸ 暂停';
                            pauseBtn.style.background = '#FF9800';
                            appLogger.info('▶ [一键催交] 继续执行');
                        }
                    });
                }
        
                if (stopBtn) {
                    stopBtn.addEventListener('click', () => {
                        isStopped = true;
                        appLogger.info('⏹ [一键催交] 用户停止催交');
                    });
                }
        
        for (let i = 0; i < studentList.length; i++) {
            currentIndex = i;  // 更新当前索引
                        // 检查是否停止
                        if (isStopped) {
                            appLogger.info('⏹ [一键催交] 流程已停止');
                            break;
                        }
            
                        // 检查是否暂停
                        while (isPaused && !isStopped) {
                            await new Promise(resolve => setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS));
                        }
            
                        if (isStopped) break;
            
            const student = studentList[i];
            const progress = `${i + 1}/${studentList.length} - ${student.name}`;
            
            appLogger.info(`\n========== [${i + 1}/${studentList.length}] ${student.name} ==========`);
            updateRemindProgressBar(i + 1, studentList.length, progress);
            
            try {
                // 滚动到元素可见位置
                student.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 等待滚动完成
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // 点击催交按钮（如果有的话）
                if (student.actionBtn) {
                    appLogger.info(`📢 [一键催交] 点击 ${student.name} 的催交按钮`);
                    appLogger.info(`🔍 [一键催交] 催交按钮类型: ${student.actionBtn.className || student.actionBtn.tagName}`);
                    student.actionBtn.click();
                    
                    // 智能等待催交确认弹窗出现（轮询检测，最多等5秒）
                    appLogger.info(`⏳ [一键催交] 等待确认弹窗...`);
                    let confirmBtn = null;
                    let attempts = 0;
                    const maxAttempts = CONFIRM_MAX_ATTEMPTS;

                    while (!confirmBtn && attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS));
                        attempts++;
                        
                        // 每5次尝试输出一次调试信息
                        if (attempts % 5 === 0) {
                            appLogger.info(`🔍 [一键催交] 第${attempts}次检测...`);
                            
                            // 查找所有可能的对话框元素
                            const messageBox = document.querySelector('.el-message-box');
                            const overlay = document.querySelector('.v-modal, .el-popup-parent--hidden, [class*="overlay"]');
                            
                            if (messageBox) {
                                const visible = window.getComputedStyle(messageBox).display !== 'none';
                                const opacity = window.getComputedStyle(messageBox).opacity;
                                const allButtons = messageBox.querySelectorAll('button, .base-button-component');
                                const innerText = messageBox.textContent?.trim().substring(0, 50);
                                appLogger.info(`  📦 MessageBox: 可见=${visible}, 透明度=${opacity}, 按钮数=${allButtons.length}`);
                                appLogger.info(`  📝 内容: ${innerText}...`);
                                
                                // 输出所有按钮的信息
                                allButtons.forEach((btn, i) => {
                                    appLogger.info(`    - 按钮${i}: "${btn.textContent.trim()}" tag=${btn.tagName} class="${btn.className}"`);
                                });
                            } else {
                                appLogger.info(`  ❌ 未找到 .el-message-box`);
                                
                                // 如果没有MessageBox，检查是否有base-button-component确认按钮
                                if (attempts === 5) {
                                    const baseBtns = document.querySelectorAll('.base-button-component');
                                    appLogger.info(`  🔍 全局找到 ${baseBtns.length} 个base-button-component:`);
                                    Array.from(baseBtns).slice(0, 5).forEach((btn, i) => {
                                        const visible = window.getComputedStyle(btn).display !== 'none';
                                        appLogger.info(`    - ${i}: "${btn.textContent.trim()}" visible=${visible} class="${btn.className}"`);
                                    });
                                }
                            }
                            
                            if (overlay) {
                                appLogger.info(`  🎭 遮罩层存在: ${overlay.className}`);
                            }
                        }
                        
                        // 尝试1：查找 .el-message-box 容器（优先）
                        const messageBox = document.querySelector('.el-message-box');
                        if (messageBox) {
                            const boxStyle = window.getComputedStyle(messageBox);
                            // 确认弹窗可见
                            if (boxStyle.display !== 'none' && boxStyle.visibility !== 'hidden' && boxStyle.opacity !== '0') {
                                // 在弹窗内查找所有按钮（包括 button 和 div.base-button-component）
                                const buttons = messageBox.querySelectorAll('button, .base-button-component');
                                
                                // 首次检测时输出所有按钮信息
                                if (attempts === 1 && buttons.length > 0) {
                                    appLogger.info(`🔍 [一键催交] MessageBox内找到 ${buttons.length} 个按钮:`);
                                    buttons.forEach((btn, i) => {
                                        const btnVisible = window.getComputedStyle(btn).display !== 'none';
                                        appLogger.info(`  - 按钮${i}: "${btn.textContent.trim()}" visible=${btnVisible} tag=${btn.tagName} class="${btn.className}"`);
                                    });
                                }
                                
                                for (const btn of buttons) {
                                    const btnStyle = window.getComputedStyle(btn);
                                    if (btnStyle.display === 'none' || btnStyle.visibility === 'hidden') continue;
                                    
                                    const btnText = btn.textContent.trim();
                                    // 优先匹配"确定"、"确认"
                                    if (btnText === '确定' || btnText === '确认' || btnText === 'OK' || btnText === '是') {
                                        confirmBtn = btn;
                                        appLogger.info(`🎯 [一键催交] 在MessageBox中找到确认按钮: "${btnText}" tag=${btn.tagName} class="${btn.className}"`);
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // 尝试2：直接查找 base-button-component 确认按钮
                        if (!confirmBtn) {
                            const baseBtns = document.querySelectorAll('.base-button-component');
                            for (const btn of baseBtns) {
                                const btnStyle = window.getComputedStyle(btn);
                                if (btnStyle.display === 'none' || btnStyle.visibility === 'hidden') continue;
                                
                                const btnText = btn.textContent.trim();
                                if (btnText === '确定' || btnText === '确认') {
                                    confirmBtn = btn;
                                    appLogger.info(`🎯 [一键催交] 找到base-button确认按钮: "${btnText}"`);
                                    break;
                                }
                            }
                        }
                        
                        // 尝试3：Element UI 标准确认按钮
                        if (!confirmBtn) {
                            confirmBtn = document.querySelector('.el-message-box__btns button.el-button--primary');
                        }
                        
                        // 尝试4：Element UI 次要按钮（可能是主按钮）
                        if (!confirmBtn) {
                            confirmBtn = document.querySelector('.el-message-box__btns button.el-button');
                        }
                        
                        // 尝试5：所有可见的确认类按钮（全局搜索，包括button和div）
                        if (!confirmBtn) {
                            const buttons = document.querySelectorAll('button, .base-button-component');
                            for (const btn of buttons) {
                                // 检查按钮及其父元素的可见性
                                const btnStyle = window.getComputedStyle(btn);
                                if (btnStyle.display === 'none' || btnStyle.visibility === 'hidden') continue;
                                
                                // 检查父元素是否可见
                                let parent = btn.parentElement;
                                let isVisible = true;
                                while (parent && parent !== document.body) {
                                    const parentStyle = window.getComputedStyle(parent);
                                    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
                                        isVisible = false;
                                        break;
                                    }
                                    parent = parent.parentElement;
                                }
                                if (!isVisible) continue;
                                
                                const btnText = btn.textContent.trim();
                                if (btnText === '确认' || btnText === '确定' || btnText === 'OK' || btnText === '是') {
                                    confirmBtn = btn;
                                    appLogger.info(`🔍 [一键催交] 找到匹配按钮: "${btnText}" (${btn.className})`);
                                    break;
                                }
                            }
                        }
                        
                        if (confirmBtn) {
                            appLogger.info(`✅ [一键催交] 找到确认按钮 (尝试${attempts}次，耗时${attempts * 200}ms)`);
                            break;
                        }
                    }
                    
                    if (confirmBtn) {
                        appLogger.info(`📌 [一键催交] 点击确认按钮催交 ${student.name}`);
                        confirmBtn.click();
                        await new Promise(resolve => setTimeout(resolve, 800));
                    } else {
                        appLogger.warn(`⚠️ [一键催交] 等待${attempts * 200}ms后未找到确认按钮，可能已自动确认或弹窗未出现`);
                        // 输出当前页面所有可见按钮用于调试（包括button和div按钮）
                        const allButtons = document.querySelectorAll('button, .base-button-component');
                        const visibleButtons = Array.from(allButtons).filter(btn => {
                            return window.getComputedStyle(btn).display !== 'none';
                        }).map(btn => `"${btn.textContent.trim()}"(${btn.tagName}:${btn.className})`);
                        appLogger.warn(`📊 [一键催交] 当前页面可见按钮: ${visibleButtons.slice(0, 10).join(', ')}`);
                        // 即使没找到确认按钮也继续，可能系统已自动确认
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    appLogger.info(`✅ [一键催交] ${student.name} 催交完成`);
                } else {
                    appLogger.warn(`⚠️ [一键催交] ${student.name} 没有找到催交按钮，跳过`);
                }
                
            } catch (error) {
                console.error(`❌ [一键催交] ${student.name} 催交失败:`, error);
            }
            
            // 间隔一下，避免过快
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // 完成
        closePanelIfExists();
        if (isStopped) {
            const completed = Math.min(currentIndex + 1, studentList.length);
            showNotification(`⏹ 催交已停止，完成 ${completed} / ${studentList.length} 位学生`, '#FF9800');
            appLogger.info(`⏹ [一键催交] 流程已停止，完成 ${completed}/${studentList.length}`);
        } else {
            showNotification(`✅ 已完成 ${studentList.length} 位学生的催交！`, '#4CAF50');
            appLogger.info('🎉 [一键催交] 流程完成！');
        }
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
    
    // 定期检查悬浮球是否存在，若被外部移除则重新创建
    let _ballCheckIntervalId = null;
    function setupFloatingBallGuard() {
        if (_ballCheckIntervalId !== null) return; // 防止重复注册
        _ballCheckIntervalId = setInterval(() => {
            const hasBall = document.getElementById('zhihuishu-ai-floating-ball');
            if (!hasBall) {
                appLogger.debug('🔄 [定期检查] 悬浮图标不存在，重新创建...');
                createFloatingBall();
            }
        }, 5000);
    }

    function teardownFloatingBallGuard() {
        if (_ballCheckIntervalId !== null) {
            clearInterval(_ballCheckIntervalId);
            _ballCheckIntervalId = null;
        }
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
        setupFloatingBallGuard();
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

        // 初始化后尝试恢复待执行任务（从主页自动跳转过来时）
        setTimeout(() => {
            resumePendingTaskIfNeeded();
        }, 600);
        
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

    // 无论是否是作业页，都尝试一次任务恢复，兼容SPA页面
    setTimeout(() => {
        resumePendingTaskIfNeeded();
    }, 1200);

    } catch (error) {
        console.error('❌ [Content Script] 整体执行出错:', error);
        console.debug('❌ [Content Script] 错误堆栈:', error.stack);
    }

})();


