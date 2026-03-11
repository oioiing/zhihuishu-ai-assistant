// 智慧树 AI 助教 - 浮窗球和UI组件模块

// ==========================================
// 样式注入
// ==========================================

function injectStyles() {
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
                z-index: 2147483647;
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
    // 浮窗球创建
    // ==========================================

    function createFloatingBall() {
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
        // 初始化菜单位置为屏幕外，避免默认位置抖动
        actionMenu.style.left = '-9999px';
        actionMenu.style.top = '-9999px';
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

        const autoModeCheckbox = document.createElement('input');
        autoModeCheckbox.type = 'checkbox';
        autoModeCheckbox.id = 'zh-auto-mode-toggle';
        autoModeCheckbox.checked = AUTO_GRADING_STATE.autoModeEnabled;
        autoModeCheckbox.style.cssText = 'cursor: pointer; width: 16px; height: 16px; margin-left: 12px;';

        const autoModeLabel = document.createElement('label');
        autoModeLabel.htmlFor = 'zh-auto-mode-toggle';
        autoModeLabel.textContent = '自动模式';
        autoModeLabel.style.cssText = 'cursor: pointer; user-select: none; font-size: 12px; margin: 0;';

        settingsGroup.appendChild(autoModeCheckbox);
        settingsGroup.appendChild(autoModeLabel);

        autoModeCheckbox.addEventListener('change', (e) => {
            AUTO_GRADING_STATE.autoModeEnabled = e.target.checked;
            persistAutoModeSetting(AUTO_GRADING_STATE.autoModeEnabled);
            showNotification(e.target.checked ? '✅ 已启用自动模式' : '⚪ 已关闭自动模式', '#2b2b2b');
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
               const ballCenterX = rect.left + rect.width / 2;
            const ballCenterY = rect.top + rect.height / 2;
               const menuWidth = 380;
               const menuHeight = 330;
               const windowWidth = window.innerWidth;
               const windowHeight = window.innerHeight;
               const gap = 12;

            // 优先把菜单贴在球的左侧，保持视觉上“挨着球”
            let menuLeft = rect.left - menuWidth - gap;
            let menuTop = ballCenterY - menuHeight / 2;

            // 左侧放不下则尝试右侧
            if (menuLeft < 10) {
                menuLeft = rect.right + gap;
            }

            // 两侧都放不下时再退化为上下布局（尽量靠近球）
            if (menuLeft + menuWidth > windowWidth - 10) {
                menuLeft = ballCenterX - menuWidth / 2;
                menuTop = rect.top - menuHeight - gap;
                if (menuTop < 10) {
                    menuTop = rect.bottom + gap;
                }
            }

            // 最终边界保护
            if (menuLeft < 10) {
                menuLeft = 10;
            }
            if (menuLeft + menuWidth > windowWidth - 10) {
                menuLeft = windowWidth - menuWidth - 10;
            }
            if (menuTop < 10) {
                menuTop = 10;
            }
            if (menuTop + menuHeight > windowHeight - 10) {
                menuTop = windowHeight - menuHeight - 10;
            }

               actionMenu.style.left = `${Math.round(menuLeft)}px`;
               actionMenu.style.top = `${Math.round(menuTop)}px`;
               actionMenu.style.right = 'auto';
               actionMenu.style.bottom = 'auto';
            
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
                    if (typeof window.runOrQueueFeatureAction === 'function') {
                        await window.runOrQueueFeatureAction('triggerAutoGrading');
                    } else {
                        console.error('❌ runOrQueueFeatureAction 未定义，请确保 content.js 已加载');
                    }
                } else if (action === 'remind') {
                    if (typeof window.runOrQueueFeatureAction === 'function') {
                        await window.runOrQueueFeatureAction('triggerOneClickRemind');
                    } else {
                        console.error('❌ runOrQueueFeatureAction 未定义，请确保 content.js 已加载');
                    }
                } else if (action === 'analyze') {
                    if (typeof window.runOrQueueFeatureAction === 'function') {
                        await window.runOrQueueFeatureAction('triggerHomeworkAnalysis');
                    } else {
                        console.error('❌ runOrQueueFeatureAction 未定义，请确保 content.js 已加载');
                    }
                } else if (action === 'manual-criteria') {
                    if (typeof window.openManualCriteriaEditor === 'function') {
                        window.openManualCriteriaEditor();
                    } else {
                        console.error('❌ openManualCriteriaEditor 未定义，请确保 content.js 已加载');
                    }
                } else if (action === 'single') {
                    const name = singleInput.value.trim();
                    if (!name) {
                        alert('请输入学生姓名');
                        singleInput.focus();
                        return;
                    }
                    if (typeof window.runOrQueueFeatureAction === 'function') {
                        await window.runOrQueueFeatureAction('triggerSingleStudent', { studentName: name });
                        singleInput.value = '';
                    } else {
                        console.error('❌ runOrQueueFeatureAction 未定义，请确保 content.js 已加载');
                    }
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
        if (!el) {
            console.warn('⚠️ [makeDraggable] 元素为 null，跳过拖拽初始化');
            return;
        }
        
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

    // ==========================================
    // UI辅助函数
    // ==========================================

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
                                <div style="display:flex;gap:8px;margin:12px 0;">
                                    <button id="zh-remind-pause-btn" style="flex:1;padding:8px 16px;background:#FF9800;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">⏸ 暂停</button>
                                    <button id="zh-remind-stop-btn" style="flex:1;padding:8px 16px;background:#f44336;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">⏹ 停止</button>
                                </div>
                <div style="${REMIND_PANEL_STYLE_TEMPLATES.barTrack}">
                    <div id="zh-remind-bar" style="${REMIND_PANEL_STYLE_TEMPLATES.bar}"></div>
                </div>
            </div>
        `;
    }

    function buildAutoGradeProgressPanelHTML() {
        return `
            <div style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.wrapper}">
                <div style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.icon}">📝</div>
                <h3 style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.title}">正在自动批改</h3>
                <p id="zh-auto-grade-progress" style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.progressText}">准备开始...</p>
                <p id="zh-page-feedback" style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.pageFeedback}">-</p>
                <div style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.barTrack}">
                    <div id="zh-auto-grade-bar" style="${AUTO_GRADE_PANEL_STYLE_TEMPLATES.bar}"></div>
                </div>
            </div>
        `;
    }

    function showFloatingPanel(title, color, bodyHTML) {
        // 移除已存在的面板
        const existingPanel = document.getElementById('zh-floating-panel');
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'zh-floating-panel';
        panel.className = 'zh-floating-panel';
        panel.innerHTML = `
            <div class="zh-panel-header" style="${UI_STYLE_TEMPLATES.floatingPanelHeader(color)}">
                <h3 style="${UI_STYLE_TEMPLATES.floatingPanelTitle(color)}">${title}</h3>
                <button class="zh-panel-close">×</button>
            </div>
            <div class="zh-panel-body" id="zh-panel-body">
                ${bodyHTML}
            </div>
        `;
        document.body.appendChild(panel);

        const closeBtn = panel.querySelector('.zh-panel-close');
        closeBtn.addEventListener('click', () => panel.remove());
        
        makeDraggable(panel.querySelector('.zh-panel-header'));
    }

    function updatePanelBody(html) {
        const body = document.getElementById('zh-panel-body');
        if (body) body.innerHTML = html;
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

