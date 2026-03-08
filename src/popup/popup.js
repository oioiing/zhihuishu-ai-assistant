console.log('popup脚本开始执行');

// 单例模式：防止重复初始化导致事件监听器堆积
let popupInitialized = false;

document.addEventListener('DOMContentLoaded', function() {
    // 防止重复初始化
    if (popupInitialized) {
        console.warn('⚠️ [Popup] 已初始化过，跳过重复初始化');
        return;
    }
    popupInitialized = true;
    console.log('DOM加载完成，开始初始化popup');
    
    // 记录初始化时间，用于调试
    const initTime = new Date().toISOString();
    console.debug(`✅ [Popup] 第一次初始化: ${initTime}`);

    
    const status = document.getElementById('status');
    const includeReviewedCheckbox = document.getElementById('include-reviewed-checkbox');
    const showRuleBreakdownCheckbox = document.getElementById('show-rule-breakdown-checkbox');
    const autoExecutionModeSelect = document.getElementById('auto-execution-mode-select');
    const studentNameInput = document.getElementById('student-name-input');
    const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
    const tabButtons = document.querySelectorAll('.tab-item[data-tab]');
    const tabPanels = document.querySelectorAll('.tab-panel[data-panel]');
    const tabBar = document.querySelector('.tab-bar');
    const tabIndicator = document.querySelector('.tab-indicator');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    const apiKeyMasked = document.getElementById('api-key-masked');
    const logLevelSelect = document.getElementById('log-level-select');
    const refreshMetricsBtn = document.getElementById('refresh-metrics-btn');
    const clearMetricsBtn = document.getElementById('clear-metrics-btn');
    const runtimeMetricsSummary = document.getElementById('runtime-metrics-summary');
    let actionInProgress = false;

    function toReadableErrorMessage(error) {
        const raw = String(error?.message || error || '').trim();
        if (!raw) return '操作失败';

        if (raw.includes('Receiving end does not exist') || raw.includes('Could not establish connection')) {
            return '当前页面未注入插件脚本，请先打开智慧树作业页面后再试';
        }

        if (raw.includes('Cannot access a chrome://')) {
            return '当前页面不支持执行该功能，请切换到智慧树页面';
        }

        return raw;
    }

    function activateTab(tabName) {
        if (!tabName) return;

        tabPanels.forEach(panel => {
            const isActive = panel.dataset.panel === tabName;
            panel.classList.toggle('active', isActive);
        });

        tabButtons.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
        });

        updateTabIndicator(tabName);
    }

    function updateTabIndicator(tabName) {
        if (!tabBar || !tabIndicator) return;

        const activeBtn = Array.from(tabButtons).find(btn => btn.dataset.tab === tabName);
        if (!activeBtn) return;

        const barRect = tabBar.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        const left = Math.max(0, btnRect.left - barRect.left);

        tabIndicator.style.width = `${btnRect.width}px`;
        tabIndicator.style.transform = `translateX(${left}px)`;
    }

    function initializeTabs() {
        tabButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                activateTab(this.dataset.tab);
            });
        });

        activateTab('home');
        window.addEventListener('resize', () => {
            const activeBtn = document.querySelector('.tab-item.active');
            if (activeBtn) {
                updateTabIndicator(activeBtn.dataset.tab);
            }
        });
    }
    
    // 学生名单缓存
    let studentNameList = [];
    let filteredList = [];
    let selectedIndex = -1;
    
    function setStatus(msg, type) {
        if (status) {
            status.textContent = msg;
            status.style.color = '#495057';
            status.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            status.style.borderColor = 'rgba(0, 0, 0, 0.08)';
            
            if (type === 'ok') {
                status.style.color = '#10b981';
                status.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
                status.style.borderColor = 'rgba(16, 185, 129, 0.25)';
            } else if (type === 'warn') {
                status.style.color = '#f59e0b';
                status.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
                status.style.borderColor = 'rgba(245, 158, 11, 0.25)';
            } else if (type === 'error') {
                status.style.color = '#ef4444';
                status.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                status.style.borderColor = 'rgba(239, 68, 68, 0.25)';
            }
        }
    }

    // 发送消息到content script
    function sendMessageToContent(action, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (!tabs || tabs.length === 0) {
                    reject(new Error('未找到活动标签页'));
                    return;
                }
                
                const message = { action, ...data };
                chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('发送消息失败:', chrome.runtime.lastError.message);
                        reject(new Error(toReadableErrorMessage(chrome.runtime.lastError)));
                        return;
                    }

                    if (response && response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(toReadableErrorMessage(response?.error || '操作失败')));
                    }
                });
            });
        });
    }

    function sendMessageToBackground(action, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action, ...data }, function(response) {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response && response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response?.error || '操作失败'));
                }
            });
        });
    }

    function updateApiKeyMaskedText(maskedValue, hasApiKey, isDefault = false) {
        if (!apiKeyMasked) return;
        if (!hasApiKey) {
            apiKeyMasked.textContent = '当前：未设置';
        } else if (isDefault) {
            apiKeyMasked.textContent = `当前: ${maskedValue} (使用内置默认Key)`;
        } else {
            apiKeyMasked.textContent = `当前: ${maskedValue} (自定义Key)`;
        }
    }

    async function initializeApiKeySettings() {
        if (!apiKeyInput || !saveApiKeyBtn) return;

        try {
            const response = await sendMessageToBackground('getApiKeyConfig');
            updateApiKeyMaskedText(response.maskedApiKey || '****', !!response.hasApiKey, response.isDefault);
            apiKeyInput.value = '';
        } catch (error) {
            console.warn('初始化 API Key 设置失败:', error.message);
            updateApiKeyMaskedText('', false);
        }
    }

    function formatRuntimeSummary(summary) {
        const success = summary?.totalSuccess || 0;
        const fail = summary?.totalFail || 0;
        const top = Array.isArray(summary?.topFailures) ? summary.topFailures : [];

        if (top.length === 0) {
            return `指标：成功 ${success} / 失败 ${fail}`;
        }

        const topText = top.map(item => `${item.name}(${item.fail})`).join('，');
        return `指标：成功 ${success} / 失败 ${fail}；高频失败：${topText}`;
    }

    async function refreshRuntimeDiagnostics(showStatus = false) {
        if (!runtimeMetricsSummary) return;
        try {
            const response = await sendMessageToBackground('getRuntimeDiagnostics');
            const diagnostics = response?.diagnostics || {};
            if (logLevelSelect && diagnostics.logLevel) {
                logLevelSelect.value = diagnostics.logLevel;
            }
            runtimeMetricsSummary.textContent = formatRuntimeSummary(diagnostics.summary || {});
            if (showStatus) {
                setStatus('✅ 运行指标已刷新', 'ok');
            }
        } catch (error) {
            runtimeMetricsSummary.textContent = '指标：读取失败';
            if (showStatus) {
                setStatus(`❌ ${error.message || '读取运行指标失败'}`, 'error');
            }
        }
    }

    // 添加功能按钮点击事件
    const rows = document.querySelectorAll('.feature-row');

    function setActionBusyState(busy) {
        actionInProgress = busy;
        rows.forEach((row) => {
            if (!row.classList.contains('settings-row') && row.dataset.action) {
                row.classList.toggle('busy', busy);
                row.setAttribute('aria-disabled', busy ? 'true' : 'false');
            }
        });
    }

    // 显示分阶段操作进度（各阶段立即显示，不添加人为等待）
    async function showProgressPhases(phases) {
        for (const phase of phases) {
            setStatus(phase.message, phase.type || 'ok');
            await new Promise(resolve => setTimeout(resolve, 30));
        }
    }

    rows.forEach(function(row) {
        if (!row.classList.contains('settings-row') && row.dataset.action) {
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');

            row.addEventListener('keydown', function(e) {
                if (e.target && e.target.closest('input, textarea, select, button')) {
                    return;
                }

                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    row.click();
                }
            });
        }

        row.addEventListener('click', async function(e) {
            // 如果点击的是设置行，不处理（它们有自己的交互）
            if (row.classList.contains('settings-row')) {
                return;
            }

            if (actionInProgress) {
                setStatus('⏳ 当前操作尚未完成，请稍候...', 'warn');
                return;
            }

            const action = row.getAttribute('data-action');
            console.log('点击功能:', action);

            try {
                setActionBusyState(true);
                if (action === 'analyze') {
                    await showProgressPhases([
                        { message: '🔄 连接服务器...', type: 'ok', delay: 350 },
                        { message: '📤 发送作业数据...', type: 'ok', delay: 380 },
                        { message: '⏳ 等待 AI 分析...', type: 'ok', delay: 420 }
                    ]);
                    await sendMessageToContent('triggerHomeworkAnalysis');
                    setStatus('✅ 分析已启动', 'ok');

                } else if (action === 'manual-criteria') {
                    await showProgressPhases([
                        { message: '🔄 连接服务器...', type: 'ok', delay: 350 },
                        { message: '📂 加载评分标准...', type: 'ok', delay: 420 }
                    ]);
                    await sendMessageToContent('triggerManualCriteria');
                    setStatus('✅ 已打开手动设置面板', 'ok');

                } else if (action === 'auto-grade') {
                    await showProgressPhases([
                        { message: '🔄 连接服务器...', type: 'ok', delay: 350 },
                        { message: '📤 发送作业数据...', type: 'ok', delay: 380 },
                        { message: '⏳ 等待 AI 批改...', type: 'ok', delay: 420 }
                    ]);
                    await sendMessageToContent('triggerAutoGrading');
                    setStatus('✅ 自动批改已启动', 'ok');

                } else if (action === 'remind') {
                    await showProgressPhases([
                        { message: '🔄 连接服务器...', type: 'ok', delay: 350 },
                        { message: '📝 准备催交消息...', type: 'ok', delay: 380 },
                        { message: '⏳ 发送中...', type: 'ok', delay: 420 }
                    ]);
                    await sendMessageToContent('triggerOneClickRemind');
                    setStatus('✅ 一键催交已启动', 'ok');

                } else if (action === 'single-student') {
                    const studentName = studentNameInput.value.trim();
                    if (!studentName) {
                        setStatus('❌ 请输入学生姓名', 'error');
                        studentNameInput.focus();
                        return;
                    }

                    await showProgressPhases([
                        { message: '🔄 连接服务器...', type: 'ok', delay: 350 },
                        { message: `📤 发送 ${studentName} 的作业数据...`, type: 'ok', delay: 380 },
                        { message: `⏳ 等待 AI 批改 ${studentName}...`, type: 'ok', delay: 420 }
                    ]);
                    await sendMessageToContent('triggerSingleStudent', { studentName });
                    setStatus(`✅ 已开始批改 ${studentName}`, 'ok');
                    studentNameInput.value = '';

                } else {
                    setStatus('⚠️ 未知功能', 'warn');
                }
            } catch (error) {
                console.error('操作失败:', error);
                setStatus(`❌ ${toReadableErrorMessage(error)}`, 'error');
            } finally {
                setActionBusyState(false);
            }
        });
    });

    // 复选框变化事件
    if (includeReviewedCheckbox) {
        includeReviewedCheckbox.addEventListener('change', async function(e) {
            e.stopPropagation();
            const checked = this.checked;
            console.log('切换重新批阅选项:', checked);
            
            try {
                await sendMessageToContent('toggleIncludeReviewed', { value: checked });
                setStatus(`${checked ? '✅ 已启用' : '⚪ 已禁用'}重新批阅已批作业`, 'ok');
            } catch (error) {
                console.error('设置失败:', error);
                setStatus('❌ 设置失败', 'error');
            }
        });
    }

    if (showRuleBreakdownCheckbox) {
        showRuleBreakdownCheckbox.addEventListener('change', async function(e) {
            e.stopPropagation();
            const checked = this.checked;
            console.log('切换规则评分明细显示:', checked);

            try {
                await sendMessageToContent('toggleRuleBreakdown', { value: checked });
                setStatus(`${checked ? '✅ 已显示' : '⚪ 已隐藏'}规则评分明细`, 'ok');
            } catch (error) {
                console.error('设置失败:', error);
                setStatus('❌ 设置失败', 'error');
            }
        });
    }

    if (autoExecutionModeSelect) {
        autoExecutionModeSelect.addEventListener('change', async function(e) {
            e.stopPropagation();
            const mode = this.value;
            console.log('切换自动执行模式:', mode);

            try {
                await sendMessageToContent('setAutoExecutionMode', { mode });
                const label = mode === 'manual' ? '完全手动' : (mode === 'navigate_only' ? '仅自动跳转' : '自动跳转并自动执行');
                setStatus(`✅ 自动执行模式已设为：${label}`, 'ok');
            } catch (error) {
                console.error('设置失败:', error);
                setStatus('❌ 设置失败', 'error');
            }
        });
    }

    async function initializeSettings() {
        try {
            const settings = await sendMessageToContent('getExtensionSettings');
            if (includeReviewedCheckbox) {
                includeReviewedCheckbox.checked = !!settings.includeReviewedSubmissions;
            }
            if (showRuleBreakdownCheckbox) {
                showRuleBreakdownCheckbox.checked = settings.showRuleScoringBreakdown !== false;
            }
            if (autoExecutionModeSelect) {
                const mode = settings.autoExecutionMode || (settings.autoModeEnabled === false ? 'manual' : 'full');
                autoExecutionModeSelect.value = mode;
            }
        } catch (error) {
            console.warn('初始化设置失败:', error.message);
        }
    }

    initializeSettings();
    initializeApiKeySettings();
    refreshRuntimeDiagnostics(false);
    initializeTabs();

    if (saveApiKeyBtn && apiKeyInput) {
        saveApiKeyBtn.addEventListener('click', async function(e) {
            e.stopPropagation();

            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                setStatus('❌ 请输入 API Key', 'error');
                apiKeyInput.focus();
                return;
            }

            saveApiKeyBtn.disabled = true;
            try {
                const response = await sendMessageToBackground('setApiKeyConfig', { apiKey });
                updateApiKeyMaskedText(response.maskedApiKey || '****', !!response.hasApiKey, response.isDefault);
                apiKeyInput.value = '';
                setStatus('✅ API Key 已安全保存', 'ok');
            } catch (error) {
                console.error('保存 API Key 失败:', error);
                setStatus(`❌ ${error.message || 'API Key 保存失败'}`, 'error');
            } finally {
                saveApiKeyBtn.disabled = false;
            }
        });
    }

    if (logLevelSelect) {
        logLevelSelect.addEventListener('change', async function(e) {
            e.stopPropagation();
            const level = this.value;
            try {
                const response = await sendMessageToBackground('setRuntimeLogLevel', { level });
                if (response?.level) {
                    logLevelSelect.value = response.level;
                }
                await refreshRuntimeDiagnostics(false);
                setStatus(`✅ 日志级别已设为 ${logLevelSelect.value}`, 'ok');
            } catch (error) {
                setStatus(`❌ ${error.message || '设置日志级别失败'}`, 'error');
            }
        });
    }

    if (refreshMetricsBtn) {
        refreshMetricsBtn.addEventListener('click', async function(e) {
            e.stopPropagation();
            await refreshRuntimeDiagnostics(true);
        });
    }

    if (clearMetricsBtn) {
        clearMetricsBtn.addEventListener('click', async function(e) {
            e.stopPropagation();
            try {
                await sendMessageToBackground('clearRuntimeMetrics');
                await refreshRuntimeDiagnostics(false);
                setStatus('✅ 运行指标已清空', 'ok');
            } catch (error) {
                setStatus(`❌ ${error.message || '清空运行指标失败'}`, 'error');
            }
        });
    }

    // 输入框点击阻止冒泡
    if (studentNameInput) {
        studentNameInput.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        // 输入事件 - 实时过滤和显示下拉列表
        studentNameInput.addEventListener('input', function(e) {
            const inputValue = this.value.trim();
            
            if (!inputValue) {
                hideAutocomplete();
                return;
            }
            
            // 过滤匹配的学生姓名
            filteredList = studentNameList.filter(name => name.includes(inputValue));
            selectedIndex = -1;
            
            if (filteredList.length > 0) {
                showAutocomplete(filteredList);
            } else {
                showAutocompleteEmpty();
            }
        });
        
        // 键盘事件 - 支持上下箭头、Tab、Enter
        studentNameInput.addEventListener('keydown', function(e) {
            if (!autocompleteDropdown.classList.contains('show')) {
                // 如果下拉列表未显示，Enter键触发批改
                if (e.key === 'Enter') {
                    triggerSingleStudentGrading();
                }
                return;
            }
            
            const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelectedItem(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelectedItem(items);
            } else if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < filteredList.length) {
                    selectStudent(filteredList[selectedIndex]);
                } else if (filteredList.length > 0) {
                    selectStudent(filteredList[0]);
                }
            } else if (e.key === 'Escape') {
                hideAutocomplete();
            }
        });
        
        // 失去焦点时延迟关闭（给点击事件时间）
        studentNameInput.addEventListener('blur', function() {
            setTimeout(() => {
                hideAutocomplete();
            }, 200);
        });
        
        // 获得焦点时，如果有输入值，重新显示列表
        studentNameInput.addEventListener('focus', function() {
            const inputValue = this.value.trim();
            if (inputValue && filteredList.length > 0) {
                showAutocomplete(filteredList);
            }
        });
    }
    
    // 显示自动补全下拉列表
    function showAutocomplete(names) {
        if (!autocompleteDropdown) return;
        
        autocompleteDropdown.innerHTML = '';
        
        names.forEach((name, index) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = name;
            item.dataset.index = index;
            
            // 鼠标悬停高亮
            item.addEventListener('mouseenter', function() {
                selectedIndex = index;
                updateSelectedItem(autocompleteDropdown.querySelectorAll('.autocomplete-item'));
            });
            
            // 鼠标点击选择
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                selectStudent(name);
            });
            
            autocompleteDropdown.appendChild(item);
        });
        
        autocompleteDropdown.classList.add('show');
    }
    
    // 显示空结果提示
    function showAutocompleteEmpty() {
        if (!autocompleteDropdown) return;
        
        autocompleteDropdown.innerHTML = '<div class="autocomplete-empty">未找到匹配的学生</div>';
        autocompleteDropdown.classList.add('show');
    }
    
    // 隐藏自动补全下拉列表
    function hideAutocomplete() {
        if (autocompleteDropdown) {
            autocompleteDropdown.classList.remove('show');
            selectedIndex = -1;
        }
    }
    
    // 更新选中项的高亮
    function updateSelectedItem(items) {
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    // 选择学生
    function selectStudent(name) {
        if (studentNameInput) {
            studentNameInput.value = name;
            hideAutocomplete();
            studentNameInput.focus();
        }
    }
    
    // 触发单个学生批改
    async function triggerSingleStudentGrading() {
        const studentName = studentNameInput.value.trim();
        if (!studentName) {
            setStatus('❌ 请输入学生姓名', 'error');
            studentNameInput.focus();
            return;
        }
        
        try {
            setStatus(`👤 正在批改学生: ${studentName}...`, 'ok');
            await sendMessageToContent('triggerSingleStudent', { studentName });
            setStatus(`✅ 已开始批改学生: ${studentName}`, 'ok');
            studentNameInput.value = '';
        } catch (error) {
            console.error('操作失败:', error);
            setStatus(`❌ ${error.message || '操作失败'}`, 'error');
        }
    }
    
    // 预加载学生名单
    async function preloadStudentNames() {
        console.log('开始预加载学生名单...');
        try {
            const response = await sendMessageToContent('getStudentNameList');
            if (response && response.success && response.nameList) {
                studentNameList = response.nameList;
                console.log(`✅ 成功加载 ${studentNameList.length} 个学生姓名`);
                
                // 如果用户已经在输入，立即显示匹配结果
                if (studentNameInput && studentNameInput.value.trim()) {
                    const inputValue = studentNameInput.value.trim();
                    filteredList = studentNameList.filter(name => name.includes(inputValue));
                    if (filteredList.length > 0) {
                        showAutocomplete(filteredList);
                    }
                }
            }
        } catch (error) {
            console.error('预加载学生名单失败:', error);
            // 失败不影响其他功能
        }
    }
    
    // 点击外部关闭下拉列表
    document.addEventListener('click', function(e) {
        if (studentNameInput && !studentNameInput.contains(e.target) && 
            autocompleteDropdown && !autocompleteDropdown.contains(e.target)) {
            hideAutocomplete();
        }
    });

    setStatus('✅ 插件界面已就绪，请选择功能', 'ok');
    console.log('popup初始化完成');
    
    // 延迟预加载学生名单（不阻塞界面显示）
    setTimeout(() => {
        preloadStudentNames();
    }, 500);
});
