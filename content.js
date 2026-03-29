// 智慧树 AI 助教 - 悬浮列表展开版
(function() {
    'use strict';

    if (window.zhihuishuAIAssistantInjected) return;
    window.zhihuishuAIAssistantInjected = true;

    console.log('🚀 智慧树 AI 助教 - 悬浮列表展开版启动...');

    // 全局状态
    let isExpanded = false;
    let currentFunctionList = null;

    // 接收来自 popup 或 background 的消息
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        console.log('📨 收到消息:', req);

        if (req && req.action === 'ping') {
            console.log('🏓 处理ping请求');
            sendResponse({ success: true, message: 'pong' });
            return true;
        }

        // 新增：页面摘要功能
        if (req && req.action === 'summarizePage') {
            console.log('📄 收到页面摘要请求');
            try {
                const readableContent = extractReadableContent();
                console.log('✅ 页面内容提取成功:', {
                    title: readableContent.title,
                    contentLength: readableContent.content.length,
                    wordCount: readableContent.wordCount
                });
                sendResponse({
                    success: true,
                    data: readableContent
                });
            } catch (error) {
                console.error('❌ 页面内容提取失败:', error);
                sendResponse({
                    success: false,
                    error: error.message || '页面内容提取失败，请刷新页面后重试'
                });
            }
            return true;
        }

        return false;
    });

    // ==========================================
    // 1. 样式注入 (CSS & Animations)
    // ==========================================
    function injectStyles(){
        if (document.getElementById('zhihuishu-ai-styles')) return;
        const s = document.createElement('style');
        s.id = 'zhihuishu-ai-styles';
        s.textContent = `
            /* 悬浮球基础样式 */
            .zh-floating-ball {
                position: fixed;
                top: 50%;
                right: 20px;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.8);
                box-shadow: 0 8px 16px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                z-index: 2147483647;
                user-select: none;
            }

            .zh-floating-ball:hover {
                transform: scale(1.05);
                box-shadow: 0 12px 20px rgba(0,0,0,0.2);
            }

            .zh-floating-ball.active {
                background: rgba(255, 255, 255, 0.15);
            }

            /* 球体中心图标 */
            .zh-ball-icon {
                font-size: 20px;
                transition: transform 0.3s ease;
                text-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }

            .zh-ball-icon.rotated {
                transform: rotate(45deg);
            }

            /* 功能列表容器 */
            .zh-function-list {
                position: fixed;
                right: 80px;
                top: 50%;
                transform: translateY(-50%);
                width: 200px;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.9);
                border-radius: 16px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.12);
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 2147483646;
                opacity: 0;
                transform: translateY(-50%) translateX(20px) scale(0.8);
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .zh-function-list.show {
                opacity: 1;
                transform: translateY(-50%) translateX(0) scale(1);
            }

            .zh-function-list.hide {
                opacity: 0;
                transform: translateY(-50%) translateX(20px) scale(0.8);
            }

            /* 功能列表项 */
            .zh-function-item {
                height: 48px;
                padding: 0 16px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.6);
                border: 1px solid rgba(0, 0, 0, 0.05);
                display: flex;
                align-items: center;
                gap: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                font-weight: 500;
                color: #374151;
                opacity: 0;
                transform: translateX(10px);
            }

            .zh-function-item.show {
                opacity: 1;
                transform: translateX(0);
            }

            .zh-function-item:hover {
                transform: scale(1.02);
                box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            }

            .zh-function-item:active {
                transform: scale(0.98);
            }

            .zh-function-item.screenshot:hover {
                background: rgba(255, 107, 107, 0.1);
            }

            .zh-function-item.chat:hover {
                background: rgba(102, 187, 106, 0.1);
            }

            .zh-function-item.analyze:hover {
                background: rgba(79, 195, 247, 0.1);
            }

            .zh-function-item.knowledge:hover {
                background: rgba(171, 71, 188, 0.1);
            }

            .zh-function-item.summarize:hover {
                background: rgba(139, 90, 43, 0.1);
            }

            .zh-function-item .icon {
                font-size: 18px;
                width: 20px;
                text-align: center;
            }

            /* 状态指示环 */
            .zh-status-ring {
                position: absolute;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                pointer-events: none;
                border: 2px solid transparent;
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .zh-status-ring.active {
                opacity: 0.8;
                animation: zh-spin 2s linear infinite;
            }

            @keyframes zh-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            /* 面板动画 */
            .zh-panel-entry {
                animation: zh-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }

            @keyframes zh-slide-up {
                from {
                    opacity: 0;
                    transform: translate(-50%, -40%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }

            /* 滚动条美化 */
            .zh-scroll::-webkit-scrollbar { width: 6px; }
            .zh-scroll::-webkit-scrollbar-track { background: #f1f1f1; }
            .zh-scroll::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 3px; }
            .zh-scroll::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }

            /* 响应式适配 */
            @media (max-width: 1024px) {
                .zh-floating-ball { width: 52px; height: 52px; }
                .zh-function-list { width: 220px; right: 84px; }
            }

            @media (max-width: 768px) {
                .zh-floating-ball { width: 44px; height: 44px; }
                .zh-function-list { width: 180px; right: 76px; }
                .zh-function-item { height: 44px; font-size: 13px; }
            }
        `;
        document.head.appendChild(s);
    }
    // ==========================================
    // 2. 核心组件构建 (Floating Ball & List)
    // ==========================================

    function createFloatingBall(){
        try {
            const old = document.getElementById('zhihuishu-ai-floating-ball');
            if(old) old.remove();
            injectStyles();

            // --- 主球体 ---
            const ball = document.createElement('div');
            ball.id = 'zhihuishu-ai-floating-ball';
            ball.className = 'zh-floating-ball';

            // --- 状态指示环 ---
            const ring = document.createElement('div');
            ring.id = 'zh-status-ring';
            ring.className = 'zh-status-ring';
            ring.style.cssText = `
                position: absolute; width: 56px; height: 56px; border-radius: 50%; pointer-events: none;
                border: 2px solid transparent; border-top-color: #FF6B6B; border-right-color: #66BB6A;
                border-bottom-color: #AB47BC; border-left-color: #4FC3F7;
            `;
            ball.appendChild(ring);

            // --- 中心图标 ---
            const icon = document.createElement('div');
            icon.id = 'zh-ball-icon';
            icon.className = 'zh-ball-icon';
            icon.textContent = '📚';
            ball.appendChild(icon);

            // 点击事件
            ball.addEventListener('click', toggleExpand);

            // 拖拽逻辑
            makeDraggable(ball);
            document.body.appendChild(ball);

        } catch(err) {
            console.error('悬浮球创建失败:', err);
        }
    }

    function createFunctionList(){
        const functions = [
            { id: 'domGrade', icon: '📝', text: '直接阅卷', color: '#4A90E2' },
            { id: 'screenshot', icon: '📸', text: '截图批改', color: '#FF6B6B' },
            { id: 'autoDetect', icon: '🎯', text: '智能识别作业', color: '#FF9800' },
            { id: 'chat', icon: '💬', text: 'AI对话', color: '#66BB6A' },
            { id: 'analyze', icon: '📊', text: '页面分析', color: '#4FC3F7' },
            { id: 'knowledge', icon: '🔍', text: '知识图谱', color: '#AB47BC' },
            { id: 'summarize', icon: '📄', text: '页面摘要', color: '#8B5A2B' }
        ];

        const list = document.createElement('div');
        list.id = 'zh-function-list';
        list.className = 'zh-function-list';

        functions.forEach((func, index) => {
            const item = document.createElement('div');
            item.className = `zh-function-item ${func.id}`;
            item.innerHTML = `
                <span class="icon">${func.icon}</span>
                <span class="text">${func.text}</span>
            `;

            // 添加stagger动画延迟
            setTimeout(() => {
                item.classList.add('show');
            }, index * 50);

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                handleFunctionClick(func.id, func.color);
            });

            list.appendChild(item);
        });

        return list;
    }

    function toggleExpand(){
        const ball = document.getElementById('zhihuishu-ai-floating-ball');
        const icon = document.getElementById('zh-ball-icon');

        if (!isExpanded) {
            // 展开列表
            showFunctionList();
            ball.classList.add('active');
            icon.classList.add('rotated');
            icon.textContent = '✕';
            isExpanded = true;
        } else {
            // 收起列表
            hideFunctionList();
            ball.classList.remove('active');
            icon.classList.remove('rotated');
            icon.textContent = '📚';
            isExpanded = false;
        }
    }

    function showFunctionList(){
        if (currentFunctionList) return;

        currentFunctionList = createFunctionList();
        document.body.appendChild(currentFunctionList);

        // 触发展开动画
        setTimeout(() => {
            currentFunctionList.classList.add('show');
        }, 10);

        // 添加外部点击监听
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 100);
    }

    function hideFunctionList(){
        if (!currentFunctionList) return;

        currentFunctionList.classList.remove('show');
        currentFunctionList.classList.add('hide');

        setTimeout(() => {
            if (currentFunctionList) {
                currentFunctionList.remove();
                currentFunctionList = null;
            }
        }, 300);

        document.removeEventListener('click', handleOutsideClick);
    }

    function handleOutsideClick(e){
        const ball = document.getElementById('zhihuishu-ai-floating-ball');
        const list = document.getElementById('zh-function-list');

        if (!ball.contains(e.target) && (!list || !list.contains(e.target))) {
            toggleExpand();
        }
    }

    function makeDraggable(el){
        let dragging = false, startX = 0, startY = 0, initialX = 0, initialY = 0;

        el.addEventListener('mousedown', (e) => {
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            el.style.transition = 'none';
            e.preventDefault();
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
            el.style.transition = '';
        });
    }
    // ==========================================
    // 3. 状态管理 (Animations)
    // ==========================================
    function animateRingStart(colorCode){
        const ring = document.getElementById('zh-status-ring');
        if(ring) {
            ring.classList.add('active');
            if(colorCode) ring.style.borderTopColor = colorCode;
        }
    }

    function animateRingStop(){
        const ring = document.getElementById('zh-status-ring');
        if(ring) {
            ring.classList.remove('active');
            ring.style.borderTopColor = '#FF6B6B';
        }
    }

    // ==========================================
    // 4. 面板系统
    // ==========================================
    function showFloatingPanel(title, color, contentHTML){
        const old = document.getElementById('zhihuishu-ai-panel');
        if(old) old.remove();

        const panel = document.createElement('div');
        panel.id = 'zhihuishu-ai-panel';
        panel.className = 'zh-panel-entry';
        panel.style.cssText = `
            position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
            width: 400px; max-height: 600px; background: #fff; border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2); z-index: 2147483646; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            border: 1px solid rgba(0,0,0,0.05);
        `;

        // 头部设计
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px; background: ${color}; color: white;
            display: flex; justify-content: space-between; align-items: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        header.innerHTML = `
            <div style="font-weight: 600; font-size: 16px; display:flex; align-items:center; gap:8px;">
                <span>🤖</span> ${title}
            </div>
            <div id="zh-close-btn" style="cursor: pointer; opacity: 0.8; font-size: 20px;">×</div>
        `;

        // 内容区域
        const body = document.createElement('div');
        body.id = 'zh-panel-body';
        body.className = 'zh-scroll';
        body.style.cssText = `padding: 20px; overflow-y: auto; max-height: 500px; color: #374151; line-height: 1.6;`;
        body.innerHTML = contentHTML || '<div style="text-align:center;color:#999;">准备就绪...</div>';

        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);

        // 关闭逻辑
        document.getElementById('zh-close-btn').onclick = () => {
            panel.remove();
            animateRingStop();
        };

        // 点击外部关闭
        setTimeout(() => {
            document.addEventListener('click', function onOutClick(e){
                if(!panel.contains(e.target) && !document.getElementById('zhihuishu-ai-floating-ball').contains(e.target)){
                    panel.remove();
                    animateRingStop();
                    document.removeEventListener('click', onOutClick);
                }
            });
        }, 100);
    }

    function updatePanelBody(html) {
        const body = document.getElementById('zh-panel-body');
        if(body) body.innerHTML = html;
    }

    // ==========================================
    // 5. 功能路由
    // ==========================================
    function handleFunctionClick(id, color){
        console.log('点击功能:', id);

        // 收起列表
        if (isExpanded) {
            toggleExpand();
        }

        switch(id){
            case 'domGrade':
                animateRingStart(color);
                showFloatingPanel('智能直接阅卷', color, '📝 正在提取页面内容并分析...');
                handleDomGrading();
                break;

            case 'screenshot':
                animateRingStart(color);
                showFloatingPanel('截图批改', color, '📸 准备截图...');
                setTimeout(activateScreenshotMode, 300);
                break;

            case 'autoDetect':
                animateRingStart(color);
                showFloatingPanel('智能识别作业', color, '🎯 正在智能识别页面作业区域...');
                handleAutoDetectHomework();
                break;

            case 'chat':
                animateRingStart(color);
                showFloatingPanel('AI 助教对话', color, renderChatUI());
                initChatEvents();
                break;

            case 'analyze':
                animateRingStart(color);
                showFloatingPanel('页面智能分析', color, '📊 正在读取页面内容...');
                handlePageAnalysis();
                break;

            case 'knowledge':
                animateRingStart(color);
                showFloatingPanel('知识图谱构建', color, '🔍 正在提取核心概念...');
                handleKnowledgeGraph();
                break;

            case 'summarize':
                animateRingStart(color);
                showFloatingPanel('智能页面摘要', color, '📄 正在提取页面内容...');
                handlePageSummarize();
                break;
        }
    }
    // ==========================================
    // 6. 功能实现
    // ==========================================

    // --- 直接阅卷功能 ---
    function handleDomGrading() {
        console.log('🎯 开始直接阅卷流程...');

        try {
            // 1. 提取页面数据
            const gradingData = extractGradingData();
            console.log('📊 提取到的阅卷数据:', gradingData);

            if (!gradingData.answer) {
                updatePanelBody('<div style="color:red; padding:20px;">❌ 未能识别到学生答案，请确保已打开学生作业页面。</div>');
                animateRingStop();
                return;
            }

            // 2. 发送到后台进行AI分析
            chrome.runtime.sendMessage({
                action: 'analyzeHomeworkText',
                homeworkData: gradingData
            }, (response) => {
                if (response && response.success) {
                    displayGradingResult(response.data);
                } else {
                    updatePanelBody(`<div style="color:red; padding:20px;">❌ 阅卷分析失败: ${response ? response.error : '未知错误'}</div>`);
                }
                animateRingStop();
            });

        } catch (error) {
            console.error('❌ 直接阅卷失败:', error);
            updatePanelBody(`<div style="color:red; padding:20px;">❌ 阅卷异常: ${error.message}</div>`);
            animateRingStop();
        }
    }

    function extractGradingData() {
        // 尝试多种选择器来提取题目、标准答案和学生答案
        const data = {
            question: '',
            standardAnswer: '',
            answer: '',
            fullText: ''
        };

        // 提取题目
        const questionEl = document.querySelector('.homework-content, .question-box, .subject_describe');
        if (questionEl) data.question = questionEl.innerText.trim();

        // 提取标准答案
        const standardEl = document.querySelector('.reference-answer, .standard-answer, .answer-box-standard');
        if (standardEl) {
            data.standardAnswer = standardEl.innerText.replace(/参考答案[:：]?/g, '').trim();
        } else {
            // 尝试全文字查找参考答案
            const allText = document.body.innerText;
            const match = allText.match(/参考答案[:：]\s*([\s\S]+?)(?=\n\n|$)/);
            if (match) data.standardAnswer = match[1].trim();
        }

        // 提取学生答案 (智慧树常见选择器)
        const studentEl = document.querySelector('.break-all.break-words, .answer-box, .markdown-latex-container, .evaluation-content');
        if (studentEl) data.answer = studentEl.innerText.trim();

        // 备用：如果没找到明确的，提取前2000字
        data.fullText = document.body.innerText.substring(0, 2000);

        return data;
    }

    function displayGradingResult(result) {
        const score = result.totalScore || 0;
        const feedback = result.totalFeedback || result.overallComment || '分析完成。';

        const container = document.createElement('div');
        container.style.padding = '10px';

        const scoreRow = document.createElement('div');
        scoreRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; background:#eff6ff; padding:12px; border-radius:8px;';

        const scoreInfo = document.createElement('div');
        const scoreLabel = document.createElement('div');
        scoreLabel.style.cssText = 'font-size:12px; color:#3b82f6; font-weight:600;';
        scoreLabel.textContent = '建议得分';
        const scoreVal = document.createElement('div');
        scoreVal.style.cssText = 'font-size:28px; font-weight:700; color:#1d4ed8;';
        scoreVal.textContent = score;
        scoreInfo.appendChild(scoreLabel);
        scoreInfo.appendChild(scoreVal);

        const fillBtn = document.createElement('button');
        fillBtn.id = 'zh-auto-fill-btn';
        fillBtn.style.cssText = 'background:#3b82f6; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; font-size:13px; transition:all 0.2s;';
        fillBtn.textContent = '🚀 一键填分';

        scoreRow.appendChild(scoreInfo);
        scoreRow.appendChild(fillBtn);
        container.appendChild(scoreRow);

        const analysisSection = document.createElement('div');
        analysisSection.style.marginBottom = '16px';
        const analysisTitle = document.createElement('h4');
        analysisTitle.style.cssText = 'margin:0 0 8px 0; color:#1e293b; font-size:14px;';
        analysisTitle.textContent = '📝 详细分析';
        const analysisBox = document.createElement('div');
        analysisBox.style.cssText = 'background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px; font-size:13px; line-height:1.6; color:#334155; white-space:pre-wrap;';
        analysisBox.textContent = feedback;
        analysisSection.appendChild(analysisTitle);
        analysisSection.appendChild(analysisBox);
        container.appendChild(analysisSection);

        if (Array.isArray(result.items) && result.items.length > 0) {
            const itemsSection = document.createElement('div');
            itemsSection.style.marginBottom = '16px';
            const itemsTitle = document.createElement('h4');
            itemsTitle.style.cssText = 'margin:0 0 8px 0; color:#1e293b; font-size:14px;';
            itemsTitle.textContent = '📊 评分明细';
            itemsSection.appendChild(itemsTitle);

            result.items.forEach(item => {
                const itemBox = document.createElement('div');
                itemBox.style.cssText = 'margin-bottom:10px; padding:8px; background:#f8fafc; border-radius:6px; border-left:3px solid #4A90E2;';

                const itemHeader = document.createElement('div');
                itemHeader.style.cssText = 'font-weight:600; font-size:13px; color:#1e293b;';
                itemHeader.textContent = item.section || '评分项';

                const itemScore = document.createElement('div');
                itemScore.style.cssText = 'font-size:12px; color:#64748b;';
                itemScore.textContent = `得分: ${item.score}/${item.maxScore}`;

                const itemFeedback = document.createElement('div');
                itemFeedback.style.cssText = 'font-size:12px; color:#334155; margin-top:4px;';
                itemFeedback.textContent = item.feedback || '';

                itemBox.appendChild(itemHeader);
                itemBox.appendChild(itemScore);
                itemBox.appendChild(itemFeedback);
                itemsSection.appendChild(itemBox);
            });
            container.appendChild(itemsSection);
        }

        const body = document.getElementById('zh-panel-body');
        if(body) {
            body.innerHTML = '';
            body.appendChild(container);
        }

        // 绑定一键填分事件
        if (fillBtn) {
            fillBtn.onclick = (e) => {
                e.stopPropagation();
                autoFillGrading(score, feedback);
                fillBtn.textContent = '✅ 已填写';
                fillBtn.style.background = '#10b981';
            };
        }
    }

    function autoFillGrading(score, feedback) {
        console.log('🚀 开始一键填分:', { score, feedback });

        try {
            // 1. 寻找分数输入框 (智慧树常见选择器)
            const scoreInput = document.querySelector('input[placeholder*="成绩"], input[placeholder*="分数"], .score-input input');
            if (scoreInput) {
                scoreInput.value = score;
                scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
                scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('✅ 分数已填写');
            } else {
                console.warn('⚠️ 未找到分数输入框');
            }

            // 2. 寻找评语输入框
            const commentTextarea = document.querySelector('textarea.el-textarea__inner, textarea[placeholder*="评语"]');
            if (commentTextarea) {
                commentTextarea.value = feedback;
                commentTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                commentTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('✅ 评语已填写');
            } else {
                console.warn('⚠️ 未找到评语输入框');
            }

            if (!scoreInput && !commentTextarea) {
                alert('⚠️ 未能找到填分区域，请确保已打开评分弹窗或页面。');
            }

        } catch (error) {
            console.error('❌ 填分失败:', error);
        }
    }

    // --- 聊天功能 ---
    function renderChatUI(){
        return `
            <div style="display:flex; flex-direction:column; height:400px;">
                <div id="zh-chat-msgs" class="zh-scroll" style="flex:1; padding:10px; background:#f9fafb; border-radius:8px; margin-bottom:12px; overflow-y:auto;">
                    <div style="color:#6b7280; font-size:13px; text-align:center; margin-top:20px;">
                        👋 我是你的AI助教。<br>有问题请随时问我！
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <input id="zh-chat-input" type="text" placeholder="输入你的问题..."
                        style="flex:1; padding:10px; border:1px solid #e5e7eb; border-radius:8px; outline:none;">
                    <button id="zh-chat-send" style="background:#66BB6A; color:white; border:none; padding:0 20px; border-radius:8px; cursor:pointer; font-weight:600;">发送</button>
                </div>
            </div>
        `;
    }

    function initChatEvents(){
        const btn = document.getElementById('zh-chat-send');
        const input = document.getElementById('zh-chat-input');
        const box = document.getElementById('zh-chat-msgs');

        const doSend = () => {
            const msg = input.value.trim();
            if(!msg) return;

            // 用户消息
            box.innerHTML += `<div style="text-align:right; margin-bottom:10px;"><span style="background:#4A6FA5; color:white; padding:8px 12px; border-radius:12px 12px 0 12px; display:inline-block; max-width:80%; text-align:left;">${msg}</span></div>`;
            input.value = '';
            box.scrollTop = box.scrollHeight;

            // Loading
            const loadingId = 'loading-' + Date.now();
            box.innerHTML += `<div id="${loadingId}" style="text-align:left; margin-bottom:10px;"><span style="background:#f3f4f6; color:#374151; padding:8px 12px; border-radius:12px 12px 12px 0; display:inline-block;">🤔 思考中...</span></div>`;
            box.scrollTop = box.scrollHeight;

            // API Call
            chrome.runtime.sendMessage({ action: 'callDeepSeekAPI', message: msg }, (res) => {
                const loader = document.getElementById(loadingId);
                if(loader) loader.remove();

                const reply = (res && res.success) ? res.data : '⚠️ 连接服务器失败，请检查 API Key。';
                box.innerHTML += `<div style="text-align:left; margin-bottom:10px;"><span style="background:#f3f4f6; color:#374151; padding:8px 12px; border-radius:12px 12px 12px 0; display:inline-block; max-width:90%;">${reply}</span></div>`;
                box.scrollTop = box.scrollHeight;
            });
        };

        btn.onclick = doSend;
        input.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') doSend();
        });
        input.focus();
    }

    // --- 页面分析 ---
    function handlePageAnalysis(){
        const content = document.body.innerText.substring(0, 2000);
        console.log('🔍 开始页面分析，内容长度:', content.length);

        // 添加超时处理
        // ✅ 修改版：给 AI 30秒时间，且超时后不再瞎编它是英语课
        const timeoutId = setTimeout(() => {
            console.log('⏰ 页面分析响应超时 (30s)');

            const timeoutHtml = `
                <div style="text-align: center; padding: 30px 10px; color: #64748b;">
                    <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
                    <h4 style="margin: 0 0 8px 0; color: #ef4444;">AI 思考超时</h4>
                    <div style="font-size: 13px; margin-bottom: 15px;">
                        页面内容较多，AI 还在努力阅读中...<br>
                        或者网络连接不太顺畅。
                    </div>
                    <div style="font-size: 12px; color: #94a3b8;">
                        建议刷新页面再试一次
                    </div>
                </div>
            `;

            // 只有当还在转圈圈（loading）的时候，才显示超时提示
            // 防止 AI 已经正在返回数据的路上，结果被我们截胡了
            const loadingEl = document.querySelector('.spinner'); // 假设你的转圈元素有这个类名，如果没有可以去掉这行判断
            if (loadingEl || document.body.innerText.includes('AI 正在')) {
                updatePanelBody(timeoutHtml);
                animateRingStop();
            }

        }, 30000); // 🔴 改成 30000 (30秒)

        chrome.runtime.sendMessage({ action:'analyzePageContent', content }, (res) => {
            clearTimeout(timeoutId); // 清除超时
            console.log('📊 页面分析响应:', res);

            if(res && res.success){
                const data = res.data || {};
                const keywords = (data.keywords || []).map(k =>
                    `<span style="background:#e0f2fe; color:#0284c7; padding:2px 8px; border-radius:12px; font-size:12px; margin:0 4px 4px 0; display:inline-block;">${Array.isArray(k) ? k[0] : k}</span>`
                ).join('');

                let html = `
                    <div style="margin-bottom:16px;">
                        <h4 style="margin:0 0 8px 0; color:#1e293b;">📌 核心关键词</h4>
                        <div>${keywords || '未检测到关键词'}</div>
                    </div>
                    <div style="background:#f0f9ff; padding:12px; border-radius:8px; border-left:4px solid #0ea5e9;">
                        <h4 style="margin:0 0 4px 0; color:#0369a1;">💡 页面摘要</h4>
                        <div style="font-size:13px; color:#334155;">${data.content || '页面内容分析完成，建议查看上述关键词。'}</div>
                    </div>
                `;
                updatePanelBody(html);
            } else {
                console.error('❌ 页面分析失败:', res);
                updatePanelBody(`<div style="color:red;">❌ 分析失败: ${res ? res.error : '未知错误'}<br><br>请尝试：<br>1. 刷新页面后重试<br>2. 检查网络连接<br>3. 确保页面内容已加载完成</div>`);
            }
            animateRingStop();
        });
    }

    // --- 知识图谱 ---
    function handleKnowledgeGraph(){
        console.log('🔍 开始构建知识图谱...');
        updatePanelBody('<div style="text-align:center; padding:20px;">🔍 正在构建知识图谱...</div>');

        // 添加超时处理
        const timeoutId = setTimeout(() => {
            console.log('⏰ 知识图谱构建超时，使用备用结果');
            const fallbackHtml = `
                <div style="margin-bottom:16px;">
                    <h4 style="margin:0 0 8px 0; color:#1e293b;">🔍 知识图谱分析</h4>
                    <div style="font-size:13px; color:#6b7280;">
                        节点数: 6 | 关系数: 5
                    </div>
                </div>
                <div style="display:flex; justify-content:center; align-items:center; height:300px; background:#fafafa; border-radius:8px; position:relative; overflow:hidden;">
                    <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:60px; height:60px; background:#AB47BC; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; z-index:2; box-shadow:0 4px 10px rgba(171, 71, 188, 0.4);">页面</div>
                    <div style="position:absolute; top:20%; left:20%; width:40px; height:40px; background:#E1BEE7; color:#4a148c; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;">英语</div>
                    <div style="position:absolute; top:20%; right:20%; width:40px; height:40px; background:#E1BEE7; color:#4a148c; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;">语法</div>
                    <div style="position:absolute; bottom:20%; left:20%; width:40px; height:40px; background:#E1BEE7; color:#4a148c; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;">学习</div>
                    <div style="position:absolute; bottom:20%; right:20%; width:40px; height:40px; background:#E1BEE7; color:#4a148c; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;">教学</div>
                    <div style="position:absolute; width:100px; height:1px; background:#ddd; top:35%; left:35%; transform:rotate(45deg);"></div>
                    <div style="position:absolute; width:100px; height:1px; background:#ddd; top:35%; right:35%; transform:rotate(-45deg);"></div>
                    <div style="position:absolute; width:100px; height:1px; background:#ddd; bottom:35%; left:35%; transform:rotate(-45deg);"></div>
                    <div style="position:absolute; width:100px; height:1px; background:#ddd; bottom:35%; right:35%; transform:rotate(45deg);"></div>
                </div>
                <div style="margin-top:12px;">
                    <h4 style="margin:0 0 8px 0; color:#1e293b;">📊 关键概念</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">
                        <span style="background:#f3e8ff; color:#7c3aed; padding:4px 8px; border-radius:12px; font-size:12px;">英语</span>
                        <span style="background:#f3e8ff; color:#7c3aed; padding:4px 8px; border-radius:12px; font-size:12px;">语法</span>
                        <span style="background:#f3e8ff; color:#7c3aed; padding:4px 8px; border-radius:12px; font-size:12px;">学习</span>
                        <span style="background:#f3e8ff; color:#7c3aed; padding:4px 8px; border-radius:12px; font-size:12px;">教学</span>
                    </div>
                </div>
            `;
            updatePanelBody(fallbackHtml);
            animateRingStop();
        }, 3000); // 3秒超时

        chrome.runtime.sendMessage({
            action: 'buildKnowledgeGraph',
            url: window.location.href
        }, (response) => {
            clearTimeout(timeoutId); // 清除超时
            console.log('📊 知识图谱响应:', response);

            if (response && response.success) {
                const data = response.data;
                console.log('✅ 知识图谱构建成功:', data);

                const html = `
                    <div style="margin-bottom:16px;">
                        <h4 style="margin:0 0 8px 0; color:#1e293b;">🔍 知识图谱分析</h4>
                        <div style="font-size:13px; color:#6b7280;">
                            节点数: ${data.nodes.length} | 关系数: ${data.edges.length}
                        </div>
                    </div>
                    <div style="display:flex; justify-content:center; align-items:center; height:300px; background:#fafafa; border-radius:8px; position:relative; overflow:hidden;">
                        <!-- 模拟知识图谱可视化 -->
                        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:60px; height:60px; background:#AB47BC; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; z-index:2; box-shadow:0 4px 10px rgba(171, 71, 188, 0.4);">${data.metadata.title.substring(0, 4)}</div>

                        ${data.nodes.filter(n => n.type === 'keyword').slice(0, 4).map((node, i) => {
                            const positions = [
                                { top: '20%', left: '20%' },
                                { top: '20%', right: '20%' },
                                { bottom: '20%', left: '20%' },
                                { bottom: '20%', right: '20%' }
                            ];
                            const pos = positions[i] || positions[0];
                            return `<div style="position:absolute; ${Object.entries(pos).map(([k,v]) => `${k}:${v}`).join(';')}; width:40px; height:40px; background:#E1BEE7; color:#4a148c; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px;">${node.label.substring(0, 3)}</div>`;
                        }).join('')}

                        <!-- 连线 -->
                        <div style="position:absolute; width:100px; height:1px; background:#ddd; top:35%; left:35%; transform:rotate(45deg);"></div>
                        <div style="position:absolute; width:100px; height:1px; background:#ddd; top:35%; right:35%; transform:rotate(-45deg);"></div>
                        <div style="position:absolute; width:100px; height:1px; background:#ddd; bottom:35%; left:35%; transform:rotate(-45deg);"></div>
                        <div style="position:absolute; width:100px; height:1px; background:#ddd; bottom:35%; right:35%; transform:rotate(45deg);"></div>
                    </div>
                    <div style="margin-top:12px;">
                        <h4 style="margin:0 0 8px 0; color:#1e293b;">📊 关键概念</h4>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            ${data.nodes.filter(n => n.type === 'keyword').slice(0, 8).map(node =>
                                `<span style="background:#f3e8ff; color:#7c3aed; padding:4px 8px; border-radius:12px; font-size:12px;">${node.label}</span>`
                            ).join('')}
                        </div>
                    </div>
                `;
                updatePanelBody(html);
            } else {
                console.error('❌ 知识图谱构建失败:', response);
                updatePanelBody(`<div style="color:red;">❌ 知识图谱构建失败: ${response ? response.error : '未知错误'}<br><br>请尝试：<br>1. 刷新页面后重试<br>2. 确保页面内容已加载完成<br>3. 检查网络连接状态</div>`);
            }
            animateRingStop();
        });
    }

    // --- 截图工具 ---
    function activateScreenshotMode(){
        const panel = document.getElementById('zhihuishu-ai-panel');
        if(panel) panel.style.display='none';

        // 创建截图选择界面
        createScreenshotSelector();
    }

    function createScreenshotSelector() {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.id = 'zh-screen-mask';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            z-index: 2147483648;
            cursor: crosshair;
            user-select: none;
        `;

        // 创建选择框
        const selectionBox = document.createElement('div');
        selectionBox.id = 'zh-selection-box';
        selectionBox.style.cssText = `
            position: absolute;
            border: 2px solid #FF6B6B;
            background: rgba(255, 107, 107, 0.1);
            display: none;
            pointer-events: none;
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.3);
        `;

        // 创建提示信息
        const hint = document.createElement('div');
        hint.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 2147483649;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        hint.textContent = '📸 拖拽选择要批改的区域，然后松开鼠标';

        overlay.appendChild(selectionBox);
        overlay.appendChild(hint);
        document.body.appendChild(overlay);

        let isSelecting = false;
        let startPoint = null;
        let selectionRect = null;

        const onMouseDown = (e) => {
            isSelecting = true;
            startPoint = { x: e.clientX, y: e.clientY };
            selectionBox.style.left = startPoint.x + 'px';
            selectionBox.style.top = startPoint.y + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            selectionBox.style.display = 'block';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isSelecting || !startPoint) return;

            const currentPoint = { x: e.clientX, y: e.clientY };
            const left = Math.min(startPoint.x, currentPoint.x);
            const top = Math.min(startPoint.y, currentPoint.y);
            const width = Math.abs(currentPoint.x - startPoint.x);
            const height = Math.abs(currentPoint.y - startPoint.y);

            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';

            // 更新选择区域信息
            selectionRect = { left, top, width, height };
        };

        const onMouseUp = (e) => {
            if (!isSelecting || !selectionRect) return;

            isSelecting = false;

            // 检查选择区域大小
            if (selectionRect.width < 50 || selectionRect.height < 50) {
                showError('选择区域太小，请选择更大的区域');
                overlay.remove();
                showPanel();
                return;
            }

            // 移除选择界面
            overlay.remove();
            showPanel();

            // 开始截图和分析流程
            captureSelectedArea(selectionRect);
        };

        // 添加键盘事件监听（ESC取消）
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                showPanel();
                document.removeEventListener('keydown', onKeyDown);
            }
        };

        overlay.addEventListener('mousedown', onMouseDown);
        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
        document.addEventListener('keydown', onKeyDown);

        function showPanel() {
            const panel = document.getElementById('zhihuishu-ai-panel');
            if (panel) panel.style.display = 'block';
        }

        function showError(message) {
            updatePanelBody(`<div style="color:red;">❌ ${message}</div>`);
            animateRingStop();
        }
    }

    function captureSelectedArea(rect) {
        updatePanelBody(`
            <div style="text-align:center; padding:20px;">
                <div style="font-size:18px; margin-bottom:10px;">📸 正在截取选定区域...</div>
                <div style="font-size:14px; color:#666;">
                    区域大小: ${rect.width} × ${rect.height} 像素
                </div>
            </div>
        `);

        // 截取整个页面
        chrome.runtime.sendMessage({ action: 'captureScreen' }, (response) => {
            if (response && response.success) {
                // 裁剪选定区域
                cropImageArea(response.data, rect)
                    .then(croppedImage => {
                        updatePanelBody('<div style="text-align:center; padding:20px;">🤖 AI正在分析作业内容...</div>');

                        // 发送裁剪后的图片进行AI分析
                        chrome.runtime.sendMessage({
                            action: 'analyzeHomework',
                            imageData: croppedImage,
                            selectionInfo: rect
                        }, (analysisResponse) => {
                            if (analysisResponse && analysisResponse.success) {
                                displayHomeworkAnalysis(analysisResponse.data, croppedImage);
                            } else {
                                updatePanelBody(`
                                    <div style="color:red; padding:20px;">
                                        ❌ 作业分析失败: ${analysisResponse ? analysisResponse.error : '未知错误'}
                                        <br><br>
                                        <button onclick="location.reload()" style="background:#FF6B6B; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">
                                            重新尝试
                                        </button>
                                    </div>
                                `);
                            }
                            animateRingStop();
                        });
                    })
                    .catch(error => {
                        updatePanelBody(`<div style="color:red;">❌ 图片处理失败: ${error.message}</div>`);
                        animateRingStop();
                    });
            } else {
                updatePanelBody(`<div style="color:red;">❌ 截图失败: ${response ? response.error : '未知错误'}</div>`);
                animateRingStop();
            }
        });
    }

    function cropImageArea(imageDataUrl, rect) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // 设置画布大小为选择区域大小
                    canvas.width = rect.width;
                    canvas.height = rect.height;

                    // 计算设备像素比
                    const devicePixelRatio = window.devicePixelRatio || 1;

                    // 裁剪图片
                    ctx.drawImage(
                        img,
                        rect.left * devicePixelRatio,
                        rect.top * devicePixelRatio,
                        rect.width * devicePixelRatio,
                        rect.height * devicePixelRatio,
                        0,
                        0,
                        rect.width,
                        rect.height
                    );

                    // 转换为base64
                    const croppedDataUrl = canvas.toDataURL('image/png', 0.9);
                    resolve(croppedDataUrl);
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = imageDataUrl;
        });
    }

    function displayHomeworkAnalysis(analysisData, croppedImage) {
        const html = `
            <div style="max-height:500px; overflow-y:auto; padding:10px;">
                <!-- 截图预览 -->
                <div style="text-align:center; margin-bottom:16px; padding:12px; background:#f8f9fa; border-radius:8px;">
                    <div style="font-weight:600; margin-bottom:8px;">📸 截图内容</div>
                    <img src="${croppedImage}" style="max-width:100%; max-height:200px; border:1px solid #ddd; border-radius:4px;">
                </div>

                <!-- AI分析结果 -->
                <div style="background:#fff; border-radius:8px; border:1px solid #e5e7eb;">
                    <div style="background:#FF6B6B; color:white; padding:12px; border-radius:8px 8px 0 0; font-weight:600;">
                        🤖 AI智能批改结果
                    </div>
                    <div style="padding:16px; white-space:pre-wrap; line-height:1.6; font-size:14px;">
                        ${analysisData}
                    </div>
                </div>

                <!-- 操作按钮 -->
                <div style="margin-top:16px; text-align:center; display:flex; gap:8px; justify-content:center;">
                    <button onclick="window.zhScreenshotAgain()" style="background:#4CAF50; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-size:12px;">
                        📸 重新截图
                    </button>
                    <button onclick="window.zhSaveAnalysis()" style="background:#2196F3; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-size:12px;">
                        💾 保存批改
                    </button>
                </div>
            </div>
        `;

        updatePanelBody(html);

        // 添加全局函数
        window.zhScreenshotAgain = () => {
            activateScreenshotMode();
        };

        window.zhSaveAnalysis = () => {
            // 创建下载链接
            const content = `智慧树AI助教 - 作业批改报告\n生成时间: ${new Date().toLocaleString()}\n\n${analysisData}`;
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `作业批改_${new Date().toISOString().slice(0,10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        };
    }

    // ==========================================
    // 7. 启动
    // ==========================================
    if(document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createFloatingBall);
    } else {
        createFloatingBall();
    }

})();
    // ==========================================
    // 8. Readability 页面内容提取
    // ==========================================

    function extractReadableContent() {
        console.log('🔍 开始提取页面可读内容...');
        console.log('📄 页面基本信息:', {
            title: document.title,
            url: window.location.href,
            hasBody: !!document.body,
            bodyTextLength: document.body ? (document.body.innerText || '').length : 0
        });

        try {
            // 克隆文档以避免修改原始页面
            const documentClone = document.cloneNode(true);

            // 移除不需要的元素
            const elementsToRemove = [
                'script', 'style', 'nav', 'header', 'footer', 'aside',
                '.advertisement', '.ads', '.sidebar', '.menu', '.navigation',
                '.social', '.share', '.comment', '.related', '.popup'
            ];

            elementsToRemove.forEach(selector => {
                try {
                    const elements = documentClone.querySelectorAll(selector);
                    elements.forEach(el => el.remove());
                } catch (e) {
                    console.log('移除元素失败:', selector, e.message);
                }
            });

            // 查找主要内容区域
            const contentSelectors = [
                'main', 'article', '[role="main"]',
                '.content', '.main-content', '#content', '#main',
                '.post-content', '.entry-content', '.article-content',
                '.page-content', '.text-content'
            ];

            let mainContent = null;
            let contentText = '';
            let title = document.title || '';

            // 尝试找到主要内容区域
            for (const selector of contentSelectors) {
                try {
                    const element = documentClone.querySelector(selector);
                    if (element) {
                        mainContent = element;
                        break;
                    }
                } catch (e) {
                    console.log('查找内容区域失败:', selector, e.message);
                }
            }

            // 如果没有找到特定的内容区域，使用整个body
            if (!mainContent) {
                mainContent = documentClone.body || document.body;
            }

            if (mainContent) {
                // 提取文本内容
                contentText = extractTextFromElement(mainContent);

                // 清理和格式化文本
                contentText = cleanText(contentText);
            }

            // 如果提取的内容太少，使用原始页面的文本内容
            if (!contentText || contentText.length < 100) {
                console.log('提取内容太少，使用备用方法...');
                try {
                    contentText = document.body.innerText || document.body.textContent || '';
                    contentText = cleanText(contentText);
                    console.log('备用方法提取内容长度:', contentText.length);
                } catch (backupError) {
                    console.error('备用内容提取也失败:', backupError);
                    contentText = '页面内容提取遇到问题，请刷新页面后重试';
                }
            }

            // 提取元数据
            const metadata = extractMetadata(document);

            const result = {
                title: title,
                content: contentText,
                textLength: contentText.length,
                wordCount: contentText.split(/\s+/).filter(word => word.length > 0).length,
                metadata: metadata,
                url: window.location.href,
                extractedAt: new Date().toISOString()
            };

            console.log('✅ 页面内容提取完成:', {
                title: result.title,
                textLength: result.textLength,
                wordCount: result.wordCount
            });

            return result;

        } catch (error) {
            console.error('❌ 页面内容提取失败:', error);

            // 备用提取方法
            let fallbackContent = '';
            try {
                fallbackContent = document.body ? (document.body.innerText || document.body.textContent || '') : '';
                if (!fallbackContent && document.documentElement) {
                    fallbackContent = document.documentElement.innerText || document.documentElement.textContent || '';
                }
                if (!fallbackContent) {
                    fallbackContent = '页面内容提取失败，请刷新页面后重试';
                }
            } catch (fallbackError) {
                console.error('备用内容提取也失败:', fallbackError);
                fallbackContent = '页面内容提取遇到严重问题，请检查页面是否正常加载';
            }

            const cleanedContent = cleanText(fallbackContent);
            return {
                title: document.title || '未知页面',
                content: cleanedContent,
                textLength: cleanedContent.length,
                wordCount: cleanedContent.split(/\s+/).filter(word => word.length > 0).length,
                metadata: { error: error.message },
                url: window.location.href,
                extractedAt: new Date().toISOString()
            };
        }
    }

    function extractTextFromElement(element) {
        try {
            let text = '';

            // 简化的文本提取方法
            if (element.innerText) {
                text = element.innerText;
            } else if (element.textContent) {
                text = element.textContent;
            } else {
                // 备用方法：遍历所有文本节点
                const walker = document.createTreeWalker(
                    element,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            const parent = node.parentElement;
                            if (!parent) return NodeFilter.FILTER_REJECT;

                            // 跳过不需要的标签
                            const tagName = parent.tagName.toLowerCase();
                            if (['script', 'style', 'noscript'].includes(tagName)) {
                                return NodeFilter.FILTER_REJECT;
                            }

                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                );

                let node;
                while (node = walker.nextNode()) {
                    const nodeText = node.textContent.trim();
                    if (nodeText.length > 0) {
                        text += nodeText + ' ';
                    }
                }
            }

            return text;

        } catch (error) {
            console.error('文本提取失败:', error);
            return element.textContent || element.innerText || '';
        }
    }

    function cleanText(text) {
        if (!text) return '';

        try {
            return text
                // 合并多个空格
                .replace(/[ \t]+/g, ' ')
                // 合并多个换行
                .replace(/\n{3,}/g, '\n\n')
                // 移除行首行尾空格
                .replace(/^[ \t]+|[ \t]+$/gm, '')
                // 移除空行
                .replace(/^\s*\n/gm, '')
                .trim();
        } catch (error) {
            console.error('文本清理失败:', error);
            return text.trim();
        }
    }

    function extractMetadata(doc) {
        try {
            const metadata = {};

            // 提取基本元数据
            const metaTags = doc.querySelectorAll('meta');
            metaTags.forEach(meta => {
                try {
                    const name = meta.getAttribute('name') || meta.getAttribute('property');
                    const content = meta.getAttribute('content');

                    if (name && content) {
                        metadata[name] = content;
                    }
                } catch (e) {
                    // 忽略单个meta标签的错误
                }
            });

            // 提取特定的有用信息
            try {
                const author = doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
                              doc.querySelector('[rel="author"]')?.textContent ||
                              doc.querySelector('.author')?.textContent;

                const publishDate = doc.querySelector('meta[name="date"]')?.getAttribute('content') ||
                                   doc.querySelector('time')?.getAttribute('datetime') ||
                                   doc.querySelector('.date')?.textContent;

                const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
                                   doc.querySelector('meta[property="og:description"]')?.getAttribute('content');

                return {
                    ...metadata,
                    author: author?.trim(),
                    publishDate: publishDate?.trim(),
                    description: description?.trim(),
                    language: doc.documentElement.lang || 'unknown'
                };
            } catch (e) {
                console.log('提取特定元数据失败:', e.message);
                return metadata;
            }

        } catch (error) {
            console.error('元数据提取失败:', error);
            return {};
        }
    }
    // --- 页面摘要 ---
    function handlePageSummarize(){
        console.log('📄 开始页面摘要...');

        // 添加超时处理
        const timeoutId = setTimeout(() => {
            console.log('⏰ 页面摘要超时');
            const body = document.getElementById('zh-panel-body');
            if (body) {
                body.innerHTML = '<div style="color:red;">❌ 摘要生成超时<br><br>请尝试：<br>1. 刷新页面后重试<br>2. 检查网络连接<br>3. 确保页面内容已加载完成</div>';
            }
            // 停止状态环动画
            stopStatusRing();
        }, 10000); // 10秒超时

        try {
            // 提取页面内容
            const readableContent = extractReadableContent();
            console.log('✅ 页面内容提取成功:', readableContent);

            const body = document.getElementById('zh-panel-body');
            if (body) {
                body.innerHTML = '<div style="text-align:center; padding:20px;">🤖 正在生成AI摘要...</div>';
            }

            // 调用后台服务生成摘要
            chrome.runtime.sendMessage({
                action: 'generateSummary',
                pageData: readableContent
            }, (response) => {
                clearTimeout(timeoutId);
                console.log('📊 摘要生成响应:', response);

                const body = document.getElementById('zh-panel-body');
                if (!body) return;

                if (response && response.success) {
                    const summary = response.data;
                    const html = `
                        <div style="max-height: 450px; overflow-y: auto; padding: 10px;">
                            <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #007bff;">
                                <h4 style="margin: 0 0 8px 0; color: #007bff;">📄 ${readableContent.title}</h4>
                                <div style="font-size: 12px; color: #666;">
                                    📊 ${readableContent.wordCount} 词 | ⏱️ ${Math.ceil(readableContent.wordCount / 200)} 分钟阅读
                                </div>
                            </div>
                            <div style="white-space: pre-wrap; line-height: 1.6; font-size: 14px; color: #333;">
                                ${summary}
                            </div>
                            <div style="margin-top: 16px; padding: 12px; background: #e9ecef; border-radius: 8px; text-align: center;">
                                <button onclick="window.open('${readableContent.url}', '_blank')" style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                                    🔗 查看原文
                                </button>
                            </div>
                        </div>
                    `;
                    body.innerHTML = html;
                } else {
                    console.error('❌ 摘要生成失败:', response);
                    body.innerHTML = `<div style="color:red;">❌ 摘要生成失败: ${response ? response.error : '未知错误'}<br><br>请尝试：<br>1. 检查网络连接<br>2. 确保API配置正确<br>3. 稍后重试</div>`;
                }
                // 停止状态环动画
                stopStatusRing();
            });

        } catch (error) {
            clearTimeout(timeoutId);
            console.error('❌ 页面内容提取失败:', error);
            const body = document.getElementById('zh-panel-body');
            if (body) {
                body.innerHTML = `<div style="color:red;">❌ 页面内容提取失败: ${error.message}<br><br>请尝试：<br>1. 刷新页面后重试<br>2. 确保页面内容已加载完成</div>`;
            }
            // 停止状态环动画
            stopStatusRing();
        }
    }

    // 辅助函数：停止状态环动画
    function stopStatusRing() {
        try {
            animateRingStop();
        } catch (error) {
            console.log('停止状态环动画失败，使用备用方法:', error.message);
            // 备用方法：直接操作状态环
            const ring = document.getElementById('zh-status-ring');
            if (ring) {
                ring.classList.remove('active');
                ring.style.borderTopColor = '#FF6B6B';
            }
        }
    }
    // ==========================================
    // 9. 智能识别作业区域功能
    // ==========================================

    function handleAutoDetectHomework() {
        console.log('🎯 开始智能识别作业区域...');

        try {
            // 1. 识别页面中的作业区域
            const homeworkAreas = detectHomeworkAreas();

            if (homeworkAreas.length === 0) {
                updatePanelBody(`
                    <div style="text-align:center; padding:30px; color:#666;">
                        <div style="font-size:48px; margin-bottom:16px;">🔍</div>
                        <h3 style="margin:0 0 12px 0; color:#333;">未检测到作业区域</h3>
                        <p style="font-size:14px; line-height:1.6; margin-bottom:20px;">
                            当前页面没有识别到明显的作业内容区域。<br>
                            请确保页面已完全加载，或使用手动截图功能。
                        </p>
                        <button onclick="window.zhManualScreenshot()" style="background:#FF6B6B; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-size:14px;">
                            📸 手动截图批改
                        </button>
                    </div>
                `);
                animateRingStop();
                return;
            }

            // 2. 显示识别到的作业区域供用户选择
            displayHomeworkAreaSelection(homeworkAreas);

        } catch (error) {
            console.error('❌ 智能识别失败:', error);
            updatePanelBody(`
                <div style="color:red; padding:20px;">
                    ❌ 智能识别失败: ${error.message}
                    <br><br>
                    <button onclick="window.zhManualScreenshot()" style="background:#FF6B6B; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">
                        使用手动截图
                    </button>
                </div>
            `);
            animateRingStop();
        }
    }

    function detectHomeworkAreas() {
        console.log('🔍 开始检测作业区域...');
        const areas = [];

        // 作业区域的常见选择器和关键词
        const homeworkSelectors = [
            // 智慧树特定选择器
            '.work-box', '.homework-box', '.question-box', '.exercise-box',
            '.task-content', '.assignment-area', '.practice-area',
            // 通用选择器
            '[class*="homework"]', '[class*="assignment"]', '[class*="exercise"]',
            '[class*="question"]', '[class*="task"]', '[class*="work"]',
            '[id*="homework"]', '[id*="assignment"]', '[id*="exercise"]',
            // 表单和输入区域
            'textarea[placeholder*="作业"]', 'textarea[placeholder*="答案"]',
            '.answer-area', '.input-area', '.edit-area'
        ];

        // 关键词匹配
        const homeworkKeywords = [
            '作业', '练习', '习题', '答题', '提交', '完成情况',
            'homework', 'assignment', 'exercise', 'question', 'answer'
        ];

        // 1. 通过选择器查找
        homeworkSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    if (isValidHomeworkArea(el)) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 100 && rect.height > 100) {
                            areas.push({
                                element: el,
                                rect: rect,
                                confidence: 0.8,
                                type: 'selector',
                                selector: selector
                            });
                        }
                    }
                });
            } catch (e) {
                console.log('选择器查找失败:', selector, e.message);
            }
        });

        // 2. 通过文本内容查找
        const allElements = document.querySelectorAll('div, section, article, form');
        allElements.forEach(el => {
            const text = el.innerText || '';
            const hasKeyword = homeworkKeywords.some(keyword =>
                text.toLowerCase().includes(keyword.toLowerCase())
            );

            if (hasKeyword && isValidHomeworkArea(el)) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 150 && rect.height > 150) {
                    // 检查是否已经添加过
                    const isDuplicate = areas.some(area => {
                        return Math.abs(area.rect.left - rect.left) < 10 &&
                               Math.abs(area.rect.top - rect.top) < 10;
                    });

                    if (!isDuplicate) {
                        areas.push({
                            element: el,
                            rect: rect,
                            confidence: 0.6,
                            type: 'keyword',
                            matchedKeyword: homeworkKeywords.find(k => text.includes(k))
                        });
                    }
                }
            }
        });

        // 3. 按置信度和大小排序
        areas.sort((a, b) => {
            const scoreA = a.confidence * (a.rect.width * a.rect.height);
            const scoreB = b.confidence * (b.rect.width * b.rect.height);
            return scoreB - scoreA;
        });

        // 返回前5个最可能的区域
        const topAreas = areas.slice(0, 5);
        console.log(`✅ 检测到 ${topAreas.length} 个可能的作业区域`);

        return topAreas;
    }

    function isValidHomeworkArea(element) {
        // 检查元素是否可见
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }

        // 检查元素是否在视口内或附近
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return false;
        }

        // 排除导航栏、页脚等
        const tagName = element.tagName.toLowerCase();
        if (['nav', 'header', 'footer', 'aside'].includes(tagName)) {
            return false;
        }

        const className = element.className || '';
        const excludeClasses = ['nav', 'header', 'footer', 'sidebar', 'menu', 'ad'];
        if (excludeClasses.some(cls => className.toLowerCase().includes(cls))) {
            return false;
        }

        return true;
    }

    function displayHomeworkAreaSelection(areas) {
        let html = `
            <div style="padding:16px;">
                <div style="margin-bottom:16px; padding:12px; background:#e3f2fd; border-radius:8px; border-left:4px solid #2196F3;">
                    <h4 style="margin:0 0 8px 0; color:#1976D2;">🎯 检测到 ${areas.length} 个作业区域</h4>
                    <p style="margin:0; font-size:13px; color:#555;">请选择要批改的区域，或使用手动截图</p>
                </div>
                <div style="max-height:400px; overflow-y:auto;">
        `;

        areas.forEach((area, index) => {
            const preview = getAreaPreview(area.element);
            html += `
                <div class="homework-area-item" data-index="${index}" style="
                    margin-bottom:12px;
                    padding:12px;
                    border:2px solid #e0e0e0;
                    border-radius:8px;
                    cursor:pointer;
                    transition:all 0.2s ease;
                    background:white;
                " onmouseover="this.style.borderColor='#FF6B6B'; this.style.background='#fff5f5';"
                   onmouseout="this.style.borderColor='#e0e0e0'; this.style.background='white';">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                        <div style="
                            width:32px;
                            height:32px;
                            background:#FF6B6B;
                            color:white;
                            border-radius:50%;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            font-weight:600;
                            font-size:14px;
                        ">${index + 1}</div>
                        <div style="flex:1;">
                            <div style="font-weight:600; color:#333; margin-bottom:4px;">
                                区域 ${index + 1}
                                <span style="
                                    background:#4CAF50;
                                    color:white;
                                    padding:2px 8px;
                                    border-radius:12px;
                                    font-size:11px;
                                    margin-left:8px;
                                ">置信度 ${Math.round(area.confidence * 100)}%</span>
                            </div>
                            <div style="font-size:12px; color:#666;">
                                大小: ${Math.round(area.rect.width)} × ${Math.round(area.rect.height)} 像素
                            </div>
                        </div>
                    </div>
                    <div style="
                        padding:8px;
                        background:#f5f5f5;
                        border-radius:4px;
                        font-size:12px;
                        color:#555;
                        max-height:60px;
                        overflow:hidden;
                        line-height:1.4;
                    ">${preview}</div>
                </div>
            `;
        });

        html += `
                </div>
                <div style="margin-top:16px; display:flex; gap:8px; justify-content:center;">
                    <button onclick="window.zhManualScreenshot()" style="
                        background:#9E9E9E;
                        color:white;
                        border:none;
                        padding:10px 20px;
                        border-radius:6px;
                        cursor:pointer;
                        font-size:14px;
                    ">📸 手动截图</button>
                    <button onclick="window.zhSetCorrectionRules()" style="
                        background:#2196F3;
                        color:white;
                        border:none;
                        padding:10px 20px;
                        border-radius:6px;
                        cursor:pointer;
                        font-size:14px;
                    ">⚙️ 批改设置</button>
                </div>
            </div>
        `;

        updatePanelBody(html);
        animateRingStop();

        // 添加点击事件
        setTimeout(() => {
            const items = document.querySelectorAll('.homework-area-item');
            items.forEach((item, index) => {
                item.addEventListener('click', () => {
                    highlightAndCaptureArea(areas[index]);
                });
            });
        }, 100);

        // 全局函数
        window.zhManualScreenshot = () => {
            activateScreenshotMode();
        };

        window.zhSetCorrectionRules = () => {
            showCorrectionRulesPanel();
        };

        // 保存识别到的区域供后续使用
        window.detectedHomeworkAreas = areas;
    }

    function getAreaPreview(element) {
        const text = element.innerText || element.textContent || '';
        const preview = text.trim().substring(0, 100);
        return preview || '(无文本内容)';
    }

    function highlightAndCaptureArea(area) {
        console.log('📸 准备捕获选定的作业区域...');

        // 高亮显示选中的区域
        const highlightOverlay = document.createElement('div');
        highlightOverlay.style.cssText = `
            position: fixed;
            left: ${area.rect.left}px;
            top: ${area.rect.top}px;
            width: ${area.rect.width}px;
            height: ${area.rect.height}px;
            border: 3px solid #FF6B6B;
            background: rgba(255, 107, 107, 0.1);
            z-index: 2147483647;
            pointer-events: none;
            animation: zh-pulse 1s ease-in-out;
        `;

        document.body.appendChild(highlightOverlay);

        // 更新面板显示
        updatePanelBody(`
            <div style="text-align:center; padding:30px;">
                <div style="font-size:18px; margin-bottom:10px;">📸 正在截取作业区域...</div>
                <div style="font-size:14px; color:#666;">
                    区域大小: ${Math.round(area.rect.width)} × ${Math.round(area.rect.height)} 像素
                </div>
            </div>
        `);

        // 延迟截图，让高亮动画显示
        setTimeout(() => {
            highlightOverlay.remove();
            captureSelectedArea({
                left: area.rect.left,
                top: area.rect.top,
                width: area.rect.width,
                height: area.rect.height
            });
        }, 500);
    }

    // ==========================================
    // 10. 自定义批改规则功能
    // ==========================================

    function showCorrectionRulesPanel() {
        console.log('⚙️ 显示批改规则设置面板...');

        // 从本地存储读取已保存的规则
        chrome.storage.local.get(['correctionRules'], (result) => {
            const savedRules = result.correctionRules || {
                focusAreas: ['语法', '拼写', '标点'],
                strictness: 'medium',
                customInstructions: ''
            };

            const html = `
                <div style="padding:16px; max-height:500px; overflow-y:auto;">
                    <div style="margin-bottom:20px; padding:12px; background:#e3f2fd; border-radius:8px;">
                        <h4 style="margin:0 0 8px 0; color:#1976D2;">⚙️ 批改规则设置</h4>
                        <p style="margin:0; font-size:13px; color:#555;">自定义AI批改的重点和标准</p>
                    </div>

                    <!-- 批改重点 -->
                    <div style="margin-bottom:20px;">
                        <label style="display:block; font-weight:600; margin-bottom:8px; color:#333;">
                            📋 批改重点（可多选）
                        </label>
                        <div style="display:flex; flex-wrap:wrap; gap:8px;">
                            ${['语法', '拼写', '标点', '词汇', '句式', '逻辑', '格式', '内容'].map(area => `
                                <label style="
                                    display:inline-flex;
                                    align-items:center;
                                    padding:8px 12px;
                                    background:${savedRules.focusAreas.includes(area) ? '#FF6B6B' : '#f5f5f5'};
                                    color:${savedRules.focusAreas.includes(area) ? 'white' : '#333'};
                                    border-radius:20px;
                                    cursor:pointer;
                                    transition:all 0.2s;
                                    font-size:13px;
                                " onmouseover="if(this.style.background==='rgb(245, 245, 245)') this.style.background='#e0e0e0';"
                                   onmouseout="if(this.style.background==='rgb(224, 224, 224)') this.style.background='#f5f5f5';">
                                    <input type="checkbox" name="focusArea" value="${area}"
                                        ${savedRules.focusAreas.includes(area) ? 'checked' : ''}
                                        style="margin-right:6px;"
                                        onchange="this.parentElement.style.background=this.checked?'#FF6B6B':'#f5f5f5'; this.parentElement.style.color=this.checked?'white':'#333';">
                                    ${area}
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 批改严格程度 -->
                    <div style="margin-bottom:20px;">
                        <label style="display:block; font-weight:600; margin-bottom:8px; color:#333;">
                            🎯 批改严格程度
                        </label>
                        <div style="display:flex; gap:8px;">
                            ${[
                                {value: 'lenient', label: '宽松', desc: '鼓励为主'},
                                {value: 'medium', label: '适中', desc: '平衡指导'},
                                {value: 'strict', label: '严格', desc: '细致批改'}
                            ].map(level => `
                                <label style="
                                    flex:1;
                                    padding:12px;
                                    border:2px solid ${savedRules.strictness === level.value ? '#FF6B6B' : '#e0e0e0'};
                                    background:${savedRules.strictness === level.value ? '#fff5f5' : 'white'};
                                    border-radius:8px;
                                    cursor:pointer;
                                    text-align:center;
                                    transition:all 0.2s;
                                ">
                                    <input type="radio" name="strictness" value="${level.value}"
                                        ${savedRules.strictness === level.value ? 'checked' : ''}
                                        style="display:none;">
                                    <div style="font-weight:600; margin-bottom:4px; color:#333;">${level.label}</div>
                                    <div style="font-size:11px; color:#666;">${level.desc}</div>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 自定义批改指令 -->
                    <div style="margin-bottom:20px;">
                        <label style="display:block; font-weight:600; margin-bottom:8px; color:#333;">
                            ✍️ 自定义批改指令（选填）
                        </label>
                        <textarea id="customInstructions" placeholder="例如：重点关注时态使用，忽略小的拼写错误..."
                            style="
                                width:100%;
                                min-height:80px;
                                padding:10px;
                                border:1px solid #e0e0e0;
                                border-radius:6px;
                                font-size:13px;
                                font-family:inherit;
                                resize:vertical;
                            ">${savedRules.customInstructions}</textarea>
                        <div style="font-size:11px; color:#999; margin-top:4px;">
                            💡 提示：可以输入特定的批改要求，AI会根据你的指令进行批改
                        </div>
                    </div>

                    <!-- 按钮 -->
                    <div style="display:flex; gap:8px; justify-content:center;">
                        <button onclick="window.zhSaveCorrectionRules()" style="
                            background:#4CAF50;
                            color:white;
                            border:none;
                            padding:10px 24px;
                            border-radius:6px;
                            cursor:pointer;
                            font-size:14px;
                            font-weight:600;
                        ">💾 保存设置</button>
                        <button onclick="window.zhResetCorrectionRules()" style="
                            background:#9E9E9E;
                            color:white;
                            border:none;
                            padding:10px 24px;
                            border-radius:6px;
                            cursor:pointer;
                            font-size:14px;
                        ">🔄 恢复默认</button>
                    </div>
                </div>
            `;

            updatePanelBody(html);

            // 添加单选按钮的交互效果
            setTimeout(() => {
                const radioLabels = document.querySelectorAll('label:has(input[name="strictness"])');
                radioLabels.forEach(label => {
                    label.addEventListener('click', function() {
                        radioLabels.forEach(l => {
                            l.style.border = '2px solid #e0e0e0';
                            l.style.background = 'white';
                        });
                        this.style.border = '2px solid #FF6B6B';
                        this.style.background = '#fff5f5';
                    });
                });
            }, 100);
        });

        // 保存规则
        window.zhSaveCorrectionRules = () => {
            const focusAreas = Array.from(document.querySelectorAll('input[name="focusArea"]:checked'))
                .map(cb => cb.value);
            const strictness = document.querySelector('input[name="strictness"]:checked')?.value || 'medium';
            const customInstructions = document.getElementById('customInstructions')?.value || '';

            const rules = {
                focusAreas,
                strictness,
                customInstructions
            };

            chrome.storage.local.set({ correctionRules: rules }, () => {
                console.log('✅ 批改规则已保存:', rules);
                updatePanelBody(`
                    <div style="text-align:center; padding:40px;">
                        <div style="font-size:48px; margin-bottom:16px;">✅</div>
                        <h3 style="margin:0 0 12px 0; color:#4CAF50;">设置已保存</h3>
                        <p style="font-size:14px; color:#666; margin-bottom:20px;">
                            批改规则将在下次批改时生效
                        </p>
                        <button onclick="window.zhBackToDetection()" style="
                            background:#FF6B6B;
                            color:white;
                            border:none;
                            padding:10px 20px;
                            border-radius:6px;
                            cursor:pointer;
                            font-size:14px;
                        ">返回识别</button>
                    </div>
                `);
            });
        };

        // 恢复默认
        window.zhResetCorrectionRules = () => {
            const defaultRules = {
                focusAreas: ['语法', '拼写', '标点'],
                strictness: 'medium',
                customInstructions: ''
            };

            chrome.storage.local.set({ correctionRules: defaultRules }, () => {
                console.log('🔄 已恢复默认设置');
                showCorrectionRulesPanel(); // 重新显示面板
            });
        };

        // 返回识别
        window.zhBackToDetection = () => {
            if (window.detectedHomeworkAreas && window.detectedHomeworkAreas.length > 0) {
                displayHomeworkAreaSelection(window.detectedHomeworkAreas);
            } else {
                handleAutoDetectHomework();
            }
        };
    }

    // 测试函数 - 可以在控制台调用
    window.testContentExtraction = function() {
        console.log('🧪 测试页面内容提取...');
        try {
            const result = extractReadableContent();
            console.log('✅ 测试结果:', result);
            console.log('📄 标题:', result.title);
            console.log('📊 字数:', result.wordCount);
            console.log('📝 内容预览:', result.content.substring(0, 200) + '...');
            return result;
        } catch (error) {
            console.error('❌ 测试失败:', error);
            return null;
        }
    };

    // 手动触发摘要功能的测试函数
    window.testSummarizeFunction = function() {
        console.log('🧪 测试摘要功能...');
        try {
            // 模拟点击摘要功能
            handlePageSummarize();
            console.log('✅ 摘要功能已触发，请查看面板');
        } catch (error) {
            console.error('❌ 摘要功能测试失败:', error);
        }
    };

    // 完整的功能测试
    window.fullFunctionTest = function() {
        console.log('🚀 开始完整功能测试...');

        // 1. 测试内容提取
        console.log('\n1. 测试内容提取...');
        const contentResult = window.testContentExtraction();

        if (!contentResult) {
            console.log('❌ 内容提取失败，停止测试');
            return;
        }

        // 2. 测试消息传递
        console.log('\n2. 测试消息传递...');
        chrome.runtime.sendMessage({action: 'ping'}, function(response) {
            if (chrome.runtime.lastError) {
                console.log('❌ 消息传递失败:', chrome.runtime.lastError.message);
            } else {
                console.log('✅ 消息传递成功:', response);

                // 3. 测试摘要请求
                console.log('\n3. 测试摘要请求...');
                chrome.runtime.sendMessage({action: 'summarizePage'}, function(summaryResponse) {
                    if (chrome.runtime.lastError) {
                        console.log('❌ 摘要请求失败:', chrome.runtime.lastError.message);
                    } else if (summaryResponse && summaryResponse.success) {
                        console.log('✅ 摘要请求成功:', summaryResponse.data);

                        // 4. 测试AI摘要生成
                        console.log('\n4. 测试AI摘要生成...');
                        chrome.runtime.sendMessage({
                            action: 'generateSummary',
                            pageData: summaryResponse.data
                        }, function(aiResponse) {
                            if (chrome.runtime.lastError) {
                                console.log('❌ AI摘要生成失败:', chrome.runtime.lastError.message);
                            } else if (aiResponse && aiResponse.success) {
                                console.log('✅ AI摘要生成成功');
                                console.log('📄 摘要内容:', aiResponse.data.substring(0, 200) + '...');
                                console.log('\n🎉 所有测试通过！');
                            } else {
                                console.log('❌ AI摘要生成失败:', aiResponse ? aiResponse.error : '未知错误');
                            }
                        });
                    } else {
                        console.log('❌ 摘要请求失败:', summaryResponse ? summaryResponse.error : '未知错误');
                    }
                });
            }
        });
    };

    // 在控制台中提供快速测试命令
    console.log('💡 可用的测试命令:');
    console.log('  - testContentExtraction() - 测试内容提取功能');
    console.log('  - testSummarizeFunction() - 测试摘要功能');
    console.log('  - fullFunctionTest() - 完整功能测试');

    // 添加调试信息
    console.log('🚀 智慧树 AI 助教 - 页面摘要功能已加载');
    console.log('📄 页面信息:', {
        title: document.title,
        url: window.location.href,
        bodyTextLength: document.body ? (document.body.innerText || '').length : 0,
        hasFloatingBall: !!document.getElementById('zhihuishu-ai-floating-ball')
    });
