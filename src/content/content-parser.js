// 智慧树 AI 助教 - 解析模块（学生列表和作业信息提取）

// ==========================================
// 学生列表检测和提取
// ==========================================

    async function detectStudentList() {
        appLogger.info('🔍 [自动批改] 开始检测学生列表...');
        
        const allStudents = [];

        // 先回到第一页，避免从中间页开始扫描
        await goToPage(1);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 1. 先获取总学生数
        const totalCount = getTotalStudentCount();
        appLogger.debug(`📊 [自动批改] 总学生数: ${totalCount}`);
        
        // 2. 检测总页数
        const totalPages = getTotalPages();
        appLogger.debug(`📄 [自动批改] 总页数: ${totalPages}`);
        
        // 3. 遍历每一页
        for (let page = 1; page <= totalPages; page++) {
            appLogger.debug(`\n📖 [自动批改] 正在扫描第 ${page} 页...`);
            
            // 如果不是第一页，需要点击翻页
            if (page > 1) {
                await goToPage(page);
                await new Promise(resolve => setTimeout(resolve, 1500)); // 等待页面加载
            }
            
            // 提取当前页的学生
            const studentsOnPage = extractStudentsFromCurrentPage();
            allStudents.push(...studentsOnPage);
            
            appLogger.debug(`✅ [自动批改] 第 ${page} 页找到 ${studentsOnPage.length} 个学生`);
        }
        
        appLogger.info(`\n🎉 [自动批改] 扫描完成！共找到 ${allStudents.length} 个学生`);

        // 扫描完成后回到第一页，保持初始状态
        await goToPage(1);
        await new Promise(resolve => setTimeout(resolve, 1500));

        return allStudents;
    }

    // 获取学生总数
    function getTotalStudentCount() {
        // 从 "全部(36)" 中提取数字
        const allText = document.body.textContent;
        const match = allText.match(/全部[（(](\d+)[）)]/);
        if (match) {
            return parseInt(match[1]);
        }
        
        // 备选：从 "共 36 条" 提取
        const match2 = allText.match(/共\s*(\d+)\s*条/);
        if (match2) {
            return parseInt(match2[1]);
        }
        
        return 0;
    }
    
    // 获取总页数
    function getTotalPages() {
        const pagers = document.querySelectorAll('.el-pager .number');
        if (pagers.length > 0) {
            // 找到最大页码
            let maxPage = 1;
            for (let pager of pagers) {
                const pageNum = parseInt(pager.textContent.trim());
                if (pageNum > maxPage) {
                    maxPage = pageNum;
                }
            }
            return maxPage;
        }
        return 1; // 默认至少1页
    }
    
    // 跳转到指定页
    async function goToPage(pageNum) {
        appLogger.debug(`🔄 [自动批改] 跳转到第 ${pageNum} 页...`);
        updatePageFeedback(`分页反馈：正在跳转到第 ${pageNum} 页...`, 'pending');
        
        // 记录当前页面的第一个学生名字，用于验证是否切换成功
        const currentFirstStudent = document.querySelector('tbody tr.el-table__row td')?.textContent?.trim();
        
        // 方式 1: 点击页码按钮
        const pagers = document.querySelectorAll('.el-pager .number');
        let clicked = false;
        for (let pager of pagers) {
            if (pager.textContent.trim() === pageNum.toString()) {
                pager.click();
                clicked = true;
                appLogger.debug(`✅ [自动批改] 已点击第 ${pageNum} 页`);
                break;
            }
        }
        
        // 方式 2: 点击"下一页"按钮
        if (!clicked) {
            const nextBtn = document.querySelector('.btn-next');
            if (nextBtn && !nextBtn.disabled) {
                nextBtn.click();
                clicked = true;
                appLogger.debug(`✅ [自动批改] 已点击"下一页"`);
            }
        }
        
        // 方式 3: 输入页码跳转
        if (!clicked) {
            const pageInput = document.querySelector('.el-pagination__editor input');
            if (pageInput) {
                pageInput.value = pageNum;
                pageInput.dispatchEvent(new Event('input', { bubbles: true }));
                pageInput.dispatchEvent(new Event('change', { bubbles: true }));
                pageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                clicked = true;
                appLogger.debug(`✅ [自动批改] 已输入页码 ${pageNum}`);
            }
        }
        
        if (!clicked) {
            appLogger.warn(`⚠️ [自动批改] 无法跳转到第 ${pageNum} 页`);
            updatePageFeedback(`分页反馈：无法跳转到第 ${pageNum} 页`, 'warn');
            return;
        }
        
        // 智能等待：轮询检测页面内容是否改变（最多等待5秒）
        let contentChanged = false;
        for (let i = 0; i < 25; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const newFirstStudent = document.querySelector('tbody tr.el-table__row td')?.textContent?.trim();
            
            // 如果是跳转到第1页，或者内容发生了变化，认为切换成功
            if (pageNum === 1 || newFirstStudent !== currentFirstStudent) {
                contentChanged = true;
                appLogger.debug(`✅ [自动批改] 页面内容已更新 (${i * 200}ms)`);
                updatePageFeedback(`分页反馈：已切换到第 ${pageNum} 页`, 'ok');
                break;
            }
        }
        
        if (!contentChanged && pageNum !== 1) {
            appLogger.warn(`⚠️ [自动批改] 页面内容未改变，可能切换失败`);
            updatePageFeedback(`分页反馈：切换可能失败`, 'warn');
        }
        
        // 额外等待200ms确保DOM稳定
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // 从当前页面提取学生信息
    function extractStudentsFromCurrentPage() {
        const studentList = [];
        
        // 尝试多个选择器来找到学生行
        let rows = document.querySelectorAll('tbody tr.el-table__row');
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('table tbody tr');
        }
        
        if (rows.length === 0) {
            rows = document.querySelectorAll('[class*="el-table__row"]');
        }
        
        if (rows.length === 0) {
            appLogger.warn('❌ [学生列表提取] 无法找到任何表格行');
            return studentList;
        }
        
        appLogger.debug(`📋 [学生列表提取] 找到 ${rows.length} 行数据`);
        
        rows.forEach((row, index) => {
            try {
                const tds = row.querySelectorAll('td');
                
                if (tds.length < 4) {
                    appLogger.warn(`⚠️ [学生列表提取] 第 ${index} 行列数不足 (${tds.length})`);
                    return;
                }
                
                // Polymas 平台布局 - 列索引
                // [0]: 勾选框
                // [1]: 姓名 (el-table_1_column_2)
                // [2]: 学号 (el-table_1_column_3)
                // [3]: 完成时间 (el-table_1_column_4)
                // [4]: 批阅状态 (el-table_1_column_5)
                // [5]: 成绩 (el-table_1_column_6)
                // [6]: 发布状态 (el-table_1_column_7)
                // [7]: 操作 (el-table_1_column_8)
                
                // 1. 提取学生名字（第2列）
                let studentName = '';
                const nameCell = tds[1];
                if (nameCell) {
                    // 从 student-info-box 中提取文本
                    const nameEl = nameCell.querySelector('[data-v-3980a020]');
                    if (nameEl) {
                        studentName = nameEl.textContent.trim();
                    }
                    // 降级方案
                    if (!studentName) {
                        studentName = nameCell.innerText?.trim() || nameCell.textContent?.trim() || '';
                    }
                }
                
                if (!studentName || studentName.length === 0) {
                    appLogger.warn(`⚠️ [学生列表提取] 第 ${index} 行无法提取名字，跳过`);
                    return;
                }
                
                appLogger.debug(`📝 [学生列表提取] [${index}] 名字: ${studentName}`);
                
                // 2. 提取学号（第3列）
                let studentId = tds[2]?.textContent?.trim() || '';
                
                // 3. 提取完成时间（第4列）
                let completionTime = tds[3]?.textContent?.trim() || '';
                
                // 4. 提取批阅状态（第5列）
                let status = tds[4]?.textContent?.trim() || '未知';
                
                // 判断是否已提交：不仅要有完成时间，还要状态不包含"未提交"
                const hasSubmission = (completionTime && completionTime !== '-' && completionTime !== '—' && completionTime !== '<!---->-') 
                    && !status.includes('未提交');
                
                // 5. 获取操作按钮（第8列或最后一列）
                let actionBtn = null;
                
                // 首先尝试第8列（index 7）
                if (tds[7]) {
                    const btn = tds[7].querySelector('.base-button-component, .primary, .is-link');
                    if (btn) {
                        actionBtn = btn;
                        appLogger.debug(`✅ [学生列表提取] [${index}] 从第8列找到操作按钮`);
                    }
                }
                
                // 如果没找到，尝试最后一列
                if (!actionBtn && tds.length > 0) {
                    const lastCell = tds[tds.length - 1];
                    const btn = lastCell.querySelector('div[class*="button"], button, [class*="base-button"]');
                    if (btn) {
                        actionBtn = btn;
                        appLogger.debug(`✅ [学生列表提取] [${index}] 从最后一列找到操作按钮`);
                    }
                }
                
                // 如果还没找到，遍历所有td寻找按钮
                if (!actionBtn) {
                    for (let i = tds.length - 1; i >= Math.max(0, tds.length - 3); i--) {
                        const btn = tds[i].querySelector('[class*="button"], [class*="base"], button');
                        if (btn && btn.textContent.includes('批阅') || btn.textContent.includes('催交')) {
                            actionBtn = btn;
                            appLogger.debug(`✅ [学生列表提取] [${index}] 从第${i}列找到操作按钮`);
                            break;
                        }
                    }
                }
                
                if (!actionBtn) {
                    appLogger.warn(`⚠️ [学生列表提取] 第 ${index} 行 (${studentName}) 无法找到操作按钮，跳过`);
                    appLogger.debug(`   行HTML: ${row.innerHTML.substring(0, 200)}...`);
                    return;
                }
                
                // ============ 关键：未提交的学生直接跳过，不添加到列表 ============
                if (!hasSubmission) {
                    appLogger.debug(`⏭️ [学生列表提取] [${index}] ${studentName} (${studentId}) - 状态: ${status}，未提交，跳过`);
                    return;
                }
                
                appLogger.debug(`✅ [学生列表提取] [${index}] ${studentName} (${studentId}) - 状态: ${status}`);
                
                studentList.push({
                    name: studentName,
                    studentId: studentId || 'N/A',
                    completionTime: completionTime || 'N/A',
                    status: status,
                    hasSubmission: hasSubmission,
                    actionBtn: actionBtn,
                    row: row
                });
                
            } catch (error) {
                appLogger.warn(`⚠️ [学生列表提取] 第 ${index} 行处理出错:`, error.message);
            }
        });
        
        appLogger.debug(`📊 [学生列表提取] 成功提取 ${studentList.length}/${rows.length} 个学生`);
        return studentList;
    }
    
    // 自动点击学生进入批改界面
    function clickStudentToEnter(student) {
        return new Promise((resolve) => {
            appLogger.debug(`🖱️ [自动批改] 点击学生: ${student.name}`);
            
            try {
                // 先关闭可能存在的弹窗
                autoCloseIntrruptDialogs();
                
                // 高亮显示要点击的学生
                student.row.style.backgroundColor = '#FFF59D';
                
                // 滚动到元素可见位置
                student.row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // 等待滚动完成后点击
                setTimeout(() => {
                    appLogger.debug(`🖱️ [自动批改] 真正点击 ${student.name} 的操作按钮`);
                    student.actionBtn.click();
                    
                    // 等待页面加载完毕（3秒保证页面完全加载）
                    setTimeout(() => {
                        // 页面加载后再次检查弹窗
                        autoCloseIntrruptDialogs();
                        
                        appLogger.debug(`✅ [自动批改] ${student.name} 的作答界面已加载`);
                        resolve();
                    }, 3000);
                }, 300);
            } catch (error) {
                appLogger.error(`❌ [自动批改] 点击学生 ${student.name} 失败:`, error);
                setTimeout(() => resolve(), 2000);
            }
        });
    }
    
    // 检测评分输入框
    function findScoreInput() {
        appLogger.debug('🔍 [自动批改] 查找评分输入框...');
        
        // ============ 方案1：查找包含"请输入成绩"或"成绩"的input ============
        let inputs = document.querySelectorAll('input[placeholder*="成绩"], input[placeholder*="分数"]');
        if (inputs.length > 0) {
            appLogger.debug('✅ [自动批改] 通过placeholder找到评分输入框');
            return inputs[0];
        }
        
        // ============ 方案2：查找 el-input__inner 类的input（Element UI风格） ============
        inputs = document.querySelectorAll('input.el-input__inner[type="text"]');
        if (inputs.length > 0) {
            // 过滤掉搜索框等其他input
            for (let input of inputs) {
                const placeholder = input.getAttribute('placeholder') || '';
                if (placeholder.includes('成绩') || placeholder.includes('分') || placeholder.includes('输入')) {
                    appLogger.debug('✅ [自动批改] 通过el-input__inner找到评分输入框');
                    return input;
                }
            }
            // 如果没有合适的placeholder，取第一个
            appLogger.debug('✅ [自动批改] 找到el-input__inner，假设为评分框');
            return inputs[0];
        }
        
        // ============ 方案3：通过"本题得分"标签定位 ============
        const labels = document.querySelectorAll('p, span, label');
        for (let label of labels) {
            const text = (label.textContent || '').trim();
            if (text.includes('本题得分') || text.includes('得分')) {
                // 向下查找最近的input
                let parent = label.closest('.el-input, .el-form-item, [class*="score"]');
                if (!parent) {
                    // 向上查找父容器，然后在其中查找input
                    parent = label.closest('div');
                    let counter = 0;
                    while (parent && counter < 5) {
                        const input = parent.querySelector('input[type="text"]');
                        if (input) {
                            appLogger.debug('✅ [自动批改] 通过标签定位找到评分输入框');
                            return input;
                        }
                        parent = parent.parentElement;
                        counter++;
                    }
                }
            }
        }
        
        // ============ 方案4：从所有input中推断（电脑页面通常先是评分，后是评语） ============
        const allInputs = document.querySelectorAll('input[type="text"]');
        const allTextareas = document.querySelectorAll('textarea');
        
        // 如果只有一个input且有textarea，这个input很可能是评分框
        if (allInputs.length === 1 && allTextareas.length > 0) {
            appLogger.debug('✅ [自动批改] 唯一的input推断为评分框');
            return allInputs[0];
        }
        
        // 如果有多个input，评分框通常在评语textarea之前
        if (allInputs.length > 0) {
            // 返回第一个text input（通常是评分）
            appLogger.debug('✅ [自动批改] 返回第一个input作为评分框');
            return allInputs[0];
        }
        
        appLogger.warn('⚠️ [自动批改] 未找到评分输入框');
        return null;
    }
    
    // 检测评语输入框
    function findCommentInput() {
        appLogger.debug('🔍 [自动批改] 查找评语输入框...');
        
        // ============ 方案1：查找textarea（最直接） ============
        let textareas = document.querySelectorAll('textarea.el-textarea__inner');
        if (textareas.length > 0) {
            appLogger.debug('✅ [自动批改] 找到评语textarea（el-textarea）');
            return textareas[0];
        }
        
        // ============ 方案2：查找所有textarea ============
        textareas = document.querySelectorAll('textarea');
        if (textareas.length > 0) {
            // 过滤掉搜索框等其他textarea
            for (let textarea of textareas) {
                const placeholder = textarea.getAttribute('placeholder') || '';
                if (placeholder.includes('评语') || placeholder.includes('备注') || placeholder.includes('老师')) {
                    appLogger.debug('✅ [自动批改] 通过placeholder找到評語textarea');
                    return textarea;
                }
            }
            // 如果没有合适的placeholder，返回第一个
            appLogger.debug('✅ [自动批改] 返回第一个textarea作为评语框');
            return textareas[0];
        }
        
        // ============ 方案3：查找 contenteditable 元素 ============
        let editables = document.querySelectorAll('[contenteditable="true"]');
        if (editables.length > 0) {
            appLogger.debug('✅ [自动批改] 找到评语contenteditable');
            return editables[0];
        }
        
        // ============ 方案4：通过"评语"标签定位 ============
        const labels = document.querySelectorAll('p, span, label, .el-textarea__wrapper');
        for (let label of labels) {
            const text = (label.textContent || '').trim();
            if (text.includes('评语') || text.includes('备注') || text.includes('总评')) {
                // 向下查找最近的textarea或输入框
                let parent = label.closest('[class*="textarea"], [class*="comment"], [class*="remark"]');
                if (!parent) {
                    parent = label.closest('div');
                }
                
                if (parent) {
                    let textarea = parent.querySelector('textarea');
                    if (textarea) {
                        appLogger.debug('✅ [自动批改] 通过标签定位找到评语textarea');
                        return textarea;
                    }
                    
                    let editable = parent.querySelector('[contenteditable="true"]');
                    if (editable) {
                        appLogger.debug('✅ [自动批改] 通过标签定位找到评语contenteditable');
                        return editable;
                    }
                }
            }
        }
        
        // ============ 方案5：查找整个批改面板的textarea ============
        const correctPanel = document.querySelector('.correct-right, [class*="correct"]');
        if (correctPanel) {
            let textarea = correctPanel.querySelector('textarea');
            if (textarea) {
                appLogger.debug('✅ [自动批改] 从批改面板找到评语textarea');
                return textarea;
            }
        }
        
        appLogger.warn('⚠️ [自动批改] 未找到评语输入框');
        return null;
    }
    
    // 自动填充评分和评语
    function autoFillGradeAndComment(score, comment) {
        appLogger.debug(`📝 [自动批改] 开始填充：分数=${score}，评语=${comment}`);
        
        // 填充评分
        const scoreInput = findScoreInput();
        if (scoreInput) {
            // 设置value属性（用于可能的Vue绑定）
            scoreInput.value = String(score);
            
            // 触发 input 和 change 事件以让Vue捕获变化
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            appLogger.debug(`✅ [自动批改] 评分已填充: ${score}`);
        } else {
            appLogger.warn('⚠️ [自动批改] 无法位置评分输入框');
        }
        
        // 填充评语
        if (comment) {
            const commentInput = findCommentInput();
            if (commentInput) {
                commentInput.value = comment;
                commentInput.textContent = comment;
                
                // 触发事件
                commentInput.dispatchEvent(new Event('input', { bubbles: true }));
                commentInput.dispatchEvent(new Event('change', { bubbles: true }));
                commentInput.dispatchEvent(new Event('blur', { bubbles: true }));
                
                appLogger.debug(`✅ [自动批改] 评语已填充`);
            } else {
                appLogger.warn('⚠️ [自动批改] 无法找到评语输入框');
            }
        }
    }

    // ==========================================
    // 7.作业类型检测与对应批改策略
    // ==========================================
    // 注意：HOMEWORK_TYPES 常量定义已移至 content-utils.js

// ==========================================
// 作业详情信息提取
// ==========================================

    function extractHomeworkDetails() {
        try {
            appLogger.info('🔍 [作业详情] 开始提取作业信息...');
            
            const details = {
                title: '',
                content: '',
                maxScore: 0,
                deadline: '',
                knowledgePoints: [],
                requirements: '',
                teacherProvidedAnswer: '',
                answerSource: '',
                extractTime: new Date().toISOString()
            };
            
            // 1. 提取标题 - 适配不同平台的HTML结构
            const titleSelectors = [
                // Polymas 平台 - 按优先级排列
                '.homework-base-info-header h4',
                '.homework-base-info-header h4 > div',
                '.exam-base-info-header h4',
                '.exam-base-info-header h4 > div',
                '.exame-title',  // Polymas 考试标题（注意拼写是 exame）
                'h4[data-v-ec5d307c]',
                'h4 div[data-v-3980a020]',
                // 智慧树平台
                'h1.title',
                'h1',
                '[class*="title"] h1',
                '[class*="homework"] h1',
                '[class*="exam"] h1',
                '.detail-title',
                'h2'
            ];
            
            appLogger.debug('🔧 [标题提取] 尝试提取标题，共', titleSelectors.length, '个选择器');
            
            for (let i = 0; i < titleSelectors.length; i++) {
                const selector = titleSelectors[i];
                const titleEl = document.querySelector(selector);
                appLogger.debug(`  [${i}] 选择器: "${selector}" -> ${titleEl ? '✅ 找到' : '❌ 未找到'}`);
                
                if (titleEl) {
                    // 尝试多种方式获取文本
                    let title = '';
                    
                    // 方法1: innerText（推荐，只获取可见文本）
                    try {
                        title = titleEl.innerText?.trim() || '';
                    } catch (e) {}
                    
                    // 方法2: textContent（所有文本）
                    if (!title) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    
                    // 方法3: 直接提取直接子节点的文本
                    if (!title) {
                        const childNodes = Array.from(titleEl.childNodes)
                            .filter(node => node.nodeType === Node.TEXT_NODE)
                            .map(node => node.textContent.trim())
                            .filter(text => text.length > 0);
                        title = childNodes.join('');
                    }
                    
                    appLogger.debug(`      原始文本 (长度${title.length}): "${title.substring(0, 60)}..."`);
                    
                    // 多步清理文本
                    title = title
                        .replace(/<!---->/g, '')  // 去除Vue注释
                        .replace(/\s+/g, ' ')     // 合并多个空白为单个空格
                        .replace(/^[\s•●◆◇▪▫─→←↑↓↔●\d.，。、；：]+/, '') // 去除前缀
                        .replace(/[\s•●◆◇▪▫─→←↑↓↔●\d.，。、；：]+$/, '') // 去除后缀
                        .trim();
                    
                    appLogger.debug(`      清理后 (长度${title.length}): "${title}"`);
                    
                    if (title.length > 2 && title.length < 200) {
                        details.title = title;
                        appLogger.info(`✅ [作业详情] 标题提取成功 (${selector}): ${details.title}`);
                        break;
                    } else {
                        appLogger.debug(`      ⚠️ 标题长度不符合: ${title.length} (需要 3-199)`);
                    }
                }
            }
            
            if (!details.title) {
                console.warn('⚠️ [标题提取] 所有标题选择器都失败，尝试从内容中提取');
                // 降级方案：从内容中提取第一行作为标题
                const introEl = document.querySelector('.homework-base-info-intro p');
                const examIntroEl = document.querySelector('.exam-base-info-intro p');
                const finalIntroEl = introEl || examIntroEl;
                if (finalIntroEl) {
                    const text = finalIntroEl.innerText?.trim() || finalIntroEl.textContent?.trim() || '';
                    const firstLine = text.split(/[。！？\n]/)[0].trim();
                    if (firstLine && firstLine.length > 2 && firstLine.length < 200) {
                        details.title = firstLine;
                        appLogger.info('📝 [作业详情] 标题 (降级方案-简介):', details.title);
                    }
                }
            }
            
            if (!details.title) {
                console.error('❌ [标题提取] 降级方案也失败了');
            }
            
            // 2. 提取满分 - 多种格式支持
            const fullText = document.body.textContent;
            let scoreMatches = [
                /满分[：:]\s*(\d+)/,
                /满分(\d+)分/,
                /满分\s*(\d+)\s*分/,
                /总分[：:]\s*(\d+)/,
                /总分\s*(\d+)\s*分/,
                /试卷满分[：:]\s*(\d+)/
            ];
            for (let pattern of scoreMatches) {
                const match = fullText.match(pattern);
                if (match) {
                    details.maxScore = parseInt(match[1]);
                    appLogger.info('⭐ [作业详情] 满分:', details.maxScore);
                    break;
                }
            }
            
            // 3. 提取截止时间
            const deadlineMatches = [
                /截止时间[：:]\s*(.+?)(?=\n|$)/,
                /截止时间\s+(.+?)(?=\n|$)/,
                /截止[\s：:]*(.+?)(?=\n|$)/,
                /考试时间[：:]\s*(.+?)(?=\n|$)/,
                /开始时间[：:]\s*(.+?)(?=\n|$)/
            ];
            for (let pattern of deadlineMatches) {
                const match = fullText.match(pattern);
                if (match) {
                    details.deadline = match[1].trim().substring(0, 50);
                    appLogger.info('⏰ [作业详情] 截止时间:', details.deadline);
                    break;
                }
            }
            
            // 4. 提取作业内容 - 优先从题目区（left-content）查找，避免误取学生答案
            const leftContent = document.querySelector('.left-content');
            const searchRoot = leftContent || document;
            
            const contentSelectors = [
                // Polymas 平台
                '.customize-base-info-preview',
                '.customize-base-info-preview p',
                '.requirements-content',
                '.exam-base-info-intro',
                '.exam-base-info-intro p',
                // 通用选择器
                '.homework-content',
                '.exam-content',
                '[class*="homework-content"]',
                '[class*="exam-content"]',
                '[class*="content"]',
                '.detail-content',
                '[class*="detail"] [class*="content"]',
                'main',
                '.main-content',
                '[class*="description"]',
                '[class*="desc"]'
            ];
            
            if (leftContent) {
                appLogger.debug('✅ [作业详情] 检测到 .left-content（题目区），将优先从此区域提取');
            }
            
            let foundContent = false;
            for (let selector of contentSelectors) {
                const contentEl = searchRoot.querySelector(selector);
                if (contentEl) {
                    const text = contentEl.textContent.trim();
                    // 去除过短的文本
                    if (text && text.length > 20 && !text.includes('html') && !text.includes('GET')) {
                        // 限制长度，避免过长的文本
                        details.content = text.substring(0, 2000);
                        appLogger.debug(`📄 [作业详情] 内容 (${selector}): ${details.content.substring(0, 80)}...`);
                        foundContent = true;
                        break;
                    }
                }
            }
            
            if (!foundContent) {
                // 降级方案：查找作业简介
                const introSelectors = [
                    '.homework-base-info-intro p',
                    '.homework-base-info-intro',
                    '.exam-base-info-intro p',
                    '.exam-base-info-intro',
                    '[class*="intro"]'
                ];
                for (let selector of introSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = el.textContent.trim();
                        if (text && text.length > 10) {
                            details.content = text;
                            appLogger.debug(`📄 [作业详情] 内容 (降级-简介): ${details.content.substring(0, 80)}...`);
                            foundContent = true;
                            break;
                        }
                    }
                }
            }
            
            if (!foundContent) {
                // 最后降级：使用整个body的文本
                const scripts = document.querySelectorAll('script, style, nav');
                const clonedBody = document.body.cloneNode(true);
                clonedBody.querySelectorAll('script, style, nav').forEach(s => s.remove());
                let bodyText = clonedBody.textContent.trim();
                if (bodyText.length > 100) {
                    details.content = bodyText.substring(0, 2000);
                    appLogger.debug(`📄 [作业详情] 内容 (降级-body): ${details.content.substring(0, 80)}...`);
                    foundContent = true;
                }
            }
            
            appLogger.info(`📊 [作业详情] 内容提取: ${foundContent ? '✅ 成功' : '⚠️ 无内容或提取失败'}, 标题: ${details.title ? '✅ 有' : '❌ 无'}`);
            
            // 5. 提取知识点
            const klgSelectors = [
                '[class*="klg"]',
                '.knowledge-point',
                '[class*="knowledge"]',
                '[class*="tag"]',
                '[class*="label"]'
            ];
            const knowledgePointsSet = new Set();
            for (let selector of klgSelectors) {
                const klgElements = document.querySelectorAll(selector);
                klgElements.forEach(el => {
                    const text = el.textContent.trim();
                    if (text && text.length > 0 && text.length < 50 && !text.includes('http')) {
                        knowledgePointsSet.add(text);
                    }
                });
            }
            details.knowledgePoints = Array.from(knowledgePointsSet).slice(0, 10);
            appLogger.info('🎓 [作业详情] 知识点:', details.knowledgePoints.length > 0 ? details.knowledgePoints : '无');
            
            // 6. 提取其他要求信息
            const otherReqs = [];
            if (fullText.includes('允许迟交')) otherReqs.push('允许迟交');
            if (fullText.includes('禁止迟交')) otherReqs.push('禁止迟交');
            if (fullText.includes('禁止申请重做')) otherReqs.push('禁止申请重做');
            if (fullText.includes('允许学生修改')) {
                const modifyMatch = fullText.match(/允许学生修改(\d+)次/);
                if (modifyMatch) otherReqs.push(`允许学生修改${modifyMatch[1]}次`);
            }
            details.requirements = otherReqs.join('；');
            appLogger.info('📋 [作业详情] 要求:', details.requirements || '无特殊要求');

            // 7. 提取老师提供的参考答案（若存在）
            const answerSelectors = [
                '.reference-answer',
                '.standard-answer',
                '[class*="reference-answer"]',
                '[class*="standard-answer"]',
                '[class*="answer-content"]',
                '.answer-box',
                '.analysis-answer'
            ];

            let teacherAnswer = '';
            for (const selector of answerSelectors) {
                const blocks = document.querySelectorAll(selector);
                for (const block of blocks) {
                    const text = (block.innerText || block.textContent || '').trim();
                    if (text && text.length >= 2 && !/^(提交答案|学生答案)$/i.test(text)) {
                        teacherAnswer = text.replace(/\s+/g, ' ').trim();
                        break;
                    }
                }
                if (teacherAnswer) break;
            }

            if (!teacherAnswer) {
                const answerLinePatterns = [
                    /(?:参考答案|标准答案|正确答案)\s*[：:]\s*([^\n]{2,300})/i,
                    /(?:参考答案|标准答案|正确答案)\s*([^\n]{2,300})/i
                ];
                for (const pattern of answerLinePatterns) {
                    const match = fullText.match(pattern);
                    if (match && match[1]) {
                        teacherAnswer = match[1].replace(/\s+/g, ' ').trim();
                        if (teacherAnswer.length >= 2) break;
                    }
                }
            }

            if (teacherAnswer) {
                details.teacherProvidedAnswer = teacherAnswer.substring(0, 1500);
                details.answerSource = 'teacher';
                appLogger.info('✅ [作业详情] 已提取老师参考答案');
            } else {
                appLogger.info('ℹ️ [作业详情] 未检测到老师参考答案');
            }
            
            // 调试信息
            appLogger.debug('🔧 [作业详情] 最终提取结果:');
            appLogger.debug('  ✓ 标题:', details.title ? `"${details.title}"` : '❌ 未提取');
            appLogger.debug('  ✓ 内容:', details.content.length > 0 ? `${details.content.length} 字` : '❌ 无');
            appLogger.debug('  ✓ 满分:', details.maxScore > 0 ? details.maxScore : '❌ 未提取');
            appLogger.debug('  ✓ 知识点:', details.knowledgePoints.length);
            appLogger.debug('  ✓ 要求:', details.requirements || '无');
            appLogger.debug('  ✓ 老师答案:', details.teacherProvidedAnswer ? '✅ 已提取' : '❌ 无');
            
            // 8. 提取附件文件列表和下载URL（仅从题目区提取，避免混入学生提交的附件）
            try {
                const fileList = (leftContent || document).querySelector('.file-list');
                if (fileList && leftContent) {
                    appLogger.debug('📎 [文件识别] 从 .left-content 区域提取附件');
                }
                const attachmentFiles = [];
                
                if (fileList) {
                    const fileItems = fileList.querySelectorAll('.file-item');
                    appLogger.debug(`📎 [文件识别] 发现 ${fileItems.length} 个附件`);
                    
                    fileItems.forEach((item, index) => {
                        // 提取文件名：通过 .box 或 .line1 获取
                        const nameEl = item.querySelector('.box, .line1');
                        if (nameEl) {
                            let fileName = nameEl.textContent.trim();
                            // 清理多余空格（如 "Ex.  8.docx" -> "Ex. 8.docx"）
                            fileName = fileName.replace(/\s+/g, ' ').trim();
                            
                            if (fileName.length > 0) {
                                // 添加点击事件拦截器，用于获取文件URL
                                const fileItemWrapper = item.closest('[class*="file"]') || item;
                                
                                attachmentFiles.push({
                                    name: fileName,
                                    index: index + 1,
                                    downloadUrl: null,  // 将在点击时获取
                                    element: fileItemWrapper
                                });
                                appLogger.debug(`  文件${index + 1}: ${fileName}`);
                            }
                        }
                    });
                    
                    if (attachmentFiles.length > 0) {
                        // 为每个文件项添加点击拦截器
                        attachmentFiles.forEach((file, idx) => {
                            if (file.element) {
                                file.element.addEventListener('click', (e) => {
                                    // 防止默认跳转
                                    e.preventDefault();
                                    e.stopPropagation();
                                    
                                    // 从URL中提取base64编码的文件URL
                                    // preview?u=...中的u参数就是base64编码的真实文件URL
                                    const previewUrl = new URL(window.location.href);
                                    // 这里我们无法直接获取，需要通过其他方式
                                    // 暂时标记为待获取状态
                                    
                                    appLogger.debug(`📎 [文件点击] 用户点击了文件: ${file.name}`);
                                }, { once: true, capture: true });
                            }
                        });
                        
                        details.attachments = attachmentFiles.map(f => ({
                            name: f.name,
                            index: f.index
                        }));
                        details.attachmentInfo = `包含 ${attachmentFiles.length} 个附件：${attachmentFiles.map(f => f.name).join('、')}`;
                        details.attachmentElements = attachmentFiles;  // 保存元素引用用于后续处理
                        appLogger.info(`📎 [文件识别] 成功识别 ${attachmentFiles.length} 个附件`);
                    }
                }
            } catch (fileError) {
                appLogger.debug('📎 [文件识别] 提取附件时出错:', fileError);
            }
            
            appLogger.debug('  📎 附件:', details.attachments ? `${details.attachments.length} 个` : '无');
            
            return details;
        } catch (error) {
            console.error('❌ [作业详情] 提取失败:', error);
            console.debug('❌ [作业详情] 错误堆栈:', error.stack);
            return null;
        }
    }
    
    // 调用API分析作业类型和批改建议
    function pingBackground(timeoutMs = 3000) {
        return new Promise((resolve) => {
            let settled = false;
            const timerId = setTimeout(() => {
                if (settled) return;
                settled = true;
                resolve(false);
            }, timeoutMs);

            chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timerId);

                if (chrome.runtime.lastError) {
                    console.warn('⚠️ [作业分析] 后台Ping失败:', chrome.runtime.lastError.message);
                    resolve(false);
                    return;
                }

                resolve(!!(response && response.success));
            });
        });
    }

    function analyzeHomeworkWithAI(homeworkDetails) {
        const maxAttempts = 2;
        const warnAfterMs = 10000;
        const hardTimeoutMs = 90000;

        // 辅助函数：使用Promise包装chrome.runtime.sendMessage
        function sendMessageAsync(message, timeoutMs = hardTimeoutMs) {
            return new Promise((resolve, reject) => {
                // 检查 runtime 是否可用
                if (!chrome.runtime || !chrome.runtime.id) {
                    reject(new Error('扩展上下文已失效，请刷新页面'));
                    return;
                }

                const timeoutId = setTimeout(() => {
                    reject(new Error(`消息超时（${timeoutMs / 1000}秒）`));
                }, timeoutMs);

                try {
                    console.log('📤 [sendMessage] 发送消息:', message.action);
                    
                    chrome.runtime.sendMessage(message, (response) => {
                        clearTimeout(timeoutId);

                        // 检查是否有运行时错误
                        const lastError = chrome.runtime.lastError;
                        if (lastError) {
                            // Service Worker 可能未启动或已终止
                            const errorMsg = lastError.message || '';
                            console.error('❌ [sendMessage] 运行时错误:', errorMsg);
                            console.error('   错误详情:', lastError);
                            
                            if (errorMsg.includes('Receiving end does not exist')) {
                                reject(new Error('Service Worker未运行。请在 chrome://extensions/ 中检查扩展状态'));
                            } else if (errorMsg.includes('Extension context invalidated')) {
                                reject(new Error('扩展已失效，请重新加载扩展并刷新页面'));
                            } else if (errorMsg.includes('message port closed')) {
                                reject(new Error('消息端口已关闭，请刷新页面'));
                            } else {
                                reject(new Error(`通信错误: ${errorMsg}`));
                            }
                            return;
                        }

                        console.log('📥 [sendMessage] 收到响应:', response?.success ? '✅ 成功' : '❌ 失败');
                        resolve(response);
                    });
                } catch (error) {
                    clearTimeout(timeoutId);
                    console.error('❌ [sendMessage] 发送失败:', error);
                    reject(new Error(`发送消息失败: ${error.message}`));
                }
            });
        }

        const attemptAnalyze = async (attempt) => {
            appLogger.info(`🤖 [作业分析] 准备调用AI进行分析... (第${attempt}次)`);
            appLogger.debug('📤 [作业分析] 发送数据到background:', homeworkDetails);

            try {
                // 首次尝试时进行完整的运行时诊断
                if (attempt === 1) {
                    console.log('🔍 [诊断] 开始运行时环境检查...');
                    console.log('  当前 URL:', window.location.href);
                    console.log('  在 iframe 中:', window.self !== window.top ? '⚠️ 是' : '✅ 否');
                    console.log('  chrome 存在:', typeof chrome !== 'undefined');
                    console.log('  chrome.runtime 存在:', typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined');
                    console.log('  chrome.runtime.id:', chrome?.runtime?.id || '未定义');
                    console.log('  扩展上下文有效:', !!(chrome?.runtime?.id));
                    
                    // 检测是否在 iframe 中（content script 配置为 all_frames: false）
                    if (window.self !== window.top) {
                        console.warn('⚠️ [诊断] 检测到在 iframe 中运行，但 content script 可能未注入');
                        console.warn('   content_scripts 配置了 all_frames: false，仅在主框架运行');
                    }
                    
                    if (!chrome?.runtime?.id) {
                        throw new Error('扩展上下文无效。可能原因：1) 在不支持的页面 2) 在 iframe 中 3) 扩展未加载。请刷新页面后重试');
                    }
                    
                    // 尝试获取 manifest 来确认扩展已加载
                    try {
                        const manifest = chrome.runtime.getManifest();
                        console.log('  扩展名称:', manifest.name);
                        console.log('  扩展版本:', manifest.version);
                    } catch (e) {
                        console.error('  无法获取 manifest:', e.message);
                    }
                    
                    console.log('✅ [诊断] 运行时环境检查完成');
                }
                
                // 等待 Service Worker 唤醒（首次尝试时等待更长时间）
                const pingTimeout = attempt === 1 ? 10000 : 5000;
                const maxPingRetries = 3;
                
                console.log('🏓 [诊断] 测试与background的通信...');
                
                let pingResponse = null;
                let pingError = null;
                
                // 尝试多次 ping，给 Service Worker 时间唤醒
                for (let i = 0; i < maxPingRetries; i++) {
                    try {
                        if (i > 0) {
                            console.log(`🔄 [诊断] Ping重试 ${i}/${maxPingRetries - 1}，等待Service Worker唤醒...`);
                            await new Promise(resolve => setTimeout(resolve, 1000 * i)); // 递增延迟
                        }
                        
                        pingResponse = await sendMessageAsync({ action: 'ping' }, pingTimeout);
                        
                        if (pingResponse && pingResponse.success) {
                            console.log('✅ [诊断] Ping成功，background正常运行');
                            break;
                        }
                    } catch (error) {
                        pingError = error;
                        console.warn(`⚠️ [诊断] Ping尝试 ${i + 1}/${maxPingRetries} 失败:`, error.message);
                    }
                }
                
                // 检查最终 ping 结果
                if (!pingResponse || !pingResponse.success) {
                    const errorMsg = pingError ? pingError.message : 'Background未响应ping';
                    console.error('❌ [诊断] 所有Ping尝试均失败:', errorMsg);
                    throw new Error(`Background通信失败: ${errorMsg}。请尝试刷新页面或重新加载扩展。`);
                }

                // 显示等待提示（10秒后）
                const warnTimeoutId = setTimeout(() => {
                    console.warn('⏳ [作业分析] 等待AI响应中... (已超过10秒)');
                    showNotification('⏳ AI分析中，请稍候...', '#FF9800');
                }, warnAfterMs);

                try {
                    // 开始真正的分析
                    const response = await sendMessageAsync({
                        action: 'analyzeHomeworkDetails',
                        data: homeworkDetails
                    }, hardTimeoutMs);

                    clearTimeout(warnTimeoutId);

                    if (!response) {
                        appLogger.error('❌ [作业分析] Background未响应');
                        throw new Error('后台服务无响应');
                    }

                    if (response.success) {
                        appLogger.info('✅ [作业分析] AI分析成功');
                        appLogger.debug('📥 [作业分析] 分析结果:', response.analysis);
                        return response.analysis;
                    } else {
                        const errorMsg = response.error || '未知错误';
                        appLogger.error(`❌ [作业分析] AI分析失败: ${errorMsg}`);
                        throw new Error(errorMsg);
                    }
                } catch (error) {
                    clearTimeout(warnTimeoutId);
                    throw error;
                }
            } catch (error) {
                appLogger.error(`❌ [作业分析] 第${attempt}次尝试失败: ${error.message}`);
                throw error;
            }
        };

        return attemptAnalyze(1).catch((error) => {
            appLogger.warn(`⚠️ [作业分析] 第1次尝试失败，准备重试...`);
            return attemptAnalyze(2);
        }).catch((error) => {
            appLogger.error(`❌ [作业分析] 所有尝试均失败: ${error.message}`);
            throw error;
        });
    }
