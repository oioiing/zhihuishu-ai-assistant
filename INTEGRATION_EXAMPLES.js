// ==========================================
// 集成优化包 - 实战示例代码
// ==========================================
// 本文件展示如何在现有代码中集成 LogManager、RetryManager、CacheManager
// 请根据实际情况进行适配

// ==========================================
// 示例1：OCR识别 - 完整优化
// ==========================================

// ❌ 旧代码（content.js 第1987-2067行）
async function performOCR_OLD(imageData) {
    let retryCount = 0;
    const maxRetries = 2;
    
    appLogger.debug('[OCR]', 'Starting OCR...');
    
    while (retryCount <= maxRetries) {
        try {
            appLogger.debug(`[OCR] Attempt ${retryCount + 1}/${maxRetries + 1}...`);
            
            const response = await sendMessageSafely(
                'performOCR',
                { imageData },
                30000
            );
            
            if (response?.success) {
                return response.text;
            }
            
            retryCount++;
            await new Promise(r => setTimeout(r, 1500));
        } catch (error) {
            appLogger.error('[OCR] Attempt failed:', error);
            retryCount++;
        }
    }
    
    throw new Error('OCR failed after all retries');
}

// ✅ 新代码（使用优化包）
async function performOCR_NEW(imageData) {
    const cacheKey = `ocr:${imageData.hash || 'default'}`;
    
    // 先查缓存（如果之前识别过相同的图片）
    const cached = cacheManager.get(cacheKey);
    if (cached) {
        logManager.info('[OCR]', '📌 使用缓存结果');
        return cached;
    }
    
    logManager.info('[OCR]', '开始OCR识别...');
    
    try {
        // 使用预置的OCR重试管理器（5次重试，60秒超时）
        const result = await ocrRetryManager.execute(
            () => sendMessageSafely('performOCR', { imageData }, 30000),
            { 
                name: 'OCR识别',
                onRetry: (info) => {
                    logManager.warn('[OCR]', 
                        `重试中... (第${info.attempt}次，延迟${Math.round(info.delay)}ms)`);
                }
            }
        );
        
        // 缓存结果（1小时）
        cacheManager.set(cacheKey, result.text, 'apiResponse');
        
        logManager.success('[OCR]', '✅ 识别完成');
        return result.text;
    } catch (error) {
        logManager.error('[OCR]', `❌ 识别失败: ${error.message}`);
        throw error;
    }
}

// ==========================================
// 示例2：AI分析 - 完整优化
// ==========================================

// ❌ 旧代码
async function analyzeWithAI_OLD(homeworkData, studentId) {
    console.log('Analyzing homework with AI...');
    
    try {
        const response = await sendMessageSafely(
            'callAI',
            { 
                content: homeworkData.content,
                type: homeworkData.type 
            },
            120000  // 120秒超时
        );
        
        console.log('AI analysis complete');
        return response;
    } catch (error) {
        console.error('AI analysis failed:', error);
        throw error;
    }
}

// ✅ 新代码（使用优化包）
async function analyzeWithAI_NEW(homeworkData, studentId) {
    const cacheKey = `analysis:${studentId}:${homeworkData.id}`;
    
    // 关键：先查缓存，避免重复分析相同的作业
    const cached = await cacheManager.getOrGenerate(
        cacheKey,
        async () => {
            logManager.info('[AI分析]', `开始分析学生 ${studentId} 的作业...`);
            
            try {
                // 使用AI重试管理器（3次重试，90秒超时）
                const result = await aiRetryManager.execute(
                    () => sendMessageSafely('callAI', {
                        content: homeworkData.content,
                        type: homeworkData.type
                    }, 120000),
                    { 
                        name: 'AI分析',
                        onRetry: (info) => {
                            logManager.warn('[AI分析]', 
                                `第${info.attempt}次重试...`);
                        }
                    }
                );
                
                logManager.success('[AI分析]', 
                    `✅ 分析完成 (${result.score}分)`);
                return result;
            } catch (error) {
                logManager.error('[AI分析]', 
                    `❌ 分析失败: ${error.message}`);
                throw error;
            }
        },
        'apiResponse'  // 1小时缓存
    );
    
    return cached;
}

// ==========================================
// 示例3：学生列表获取 - 缓存优化
// ==========================================

// ❌ 旧代码（每次都重新扫描）
async function getStudentList_OLD(classId) {
    console.log(`Scanning students from class ${classId}...`);
    
    const students = [];
    // ... 扫描过程（通常60秒）
    
    return students;
}

// ✅ 新代码（30分钟内使用缓存）
async function getStudentList_NEW(classId) {
    const cacheKey = `students:${classId}`;
    
    logManager.debug('[学生列表]', `获取班级 ${classId} 的学生列表...`);
    
    // 获取或生成：如果有缓存则直接返回，否则生成并缓存
    const students = await cacheManager.getOrGenerate(
        cacheKey,
        async () => {
            logManager.info('[学生列表]', '开始扫描学生列表（首次或缓存过期）...');
            
            try {
                // 这部分操作通常很耗时（60秒左右）
                const result = await apiRetryManager.execute(
                    async () => {
                        // 实际的扫描逻辑
                        return new Promise(resolve => {
                            // ... 扫描代码
                            resolve([]);
                        });
                    },
                    { name: '获取学生列表' }
                );
                
                logManager.success('[学生列表]', 
                    `✅ 扫描完成，共 ${result.length} 个学生`);
                return result;
            } catch (error) {
                logManager.error('[学生列表]', 
                    `❌ 扫描失败: ${error.message}`);
                throw error;
            }
        },
        'studentList'  // 30分钟缓存
    );
    
    return students;
}

// ==========================================
// 示例4：批量操作 - 并发控制
// ==========================================

// ❌ 旧代码（全部并发，可能冲击服务器）
async function analyzeAllStudents_OLD(students) {
    console.log(`Analyzing ${students.length} students...`);
    
    const results = await Promise.all(
        students.map(student => analyzeWithAI_OLD(student.homework, student.id))
    );
    
    console.log('Done');
    return results;
}

// ✅ 新代码（限制并发，带日志）
async function analyzeAllStudents_NEW(students) {
    logManager.info('[批处理]', 
        `开始分析 ${students.length} 个学生的作业...`);
    
    const results = await aiRetryManager.executeBatch(
        students.map(student => 
            () => analyzeWithAI_NEW(student.homework, student.id)
        ),
        { 
            maxConcurrent: 3,  // 最多同时分析3个
            name: '学生作业分析'
        }
    );
    
    const successful = results.filter(r => !r.error).length;
    logManager.success('[批处理]', 
        `✅ 完成 ${successful}/${students.length} 个学生的分析`);
    
    return results;
}

// ==========================================
// 示例5：后台任务 - 定期清理和统计
// ==========================================

// 后台定期任务初始化
function initBackgroundTasks() {
    logManager.info('[后台任务]', '初始化后台任务...');
    
    // 每5分钟清理一次过期缓存
    setInterval(() => {
        logManager.debug('[后台任务]', '执行缓存清理...');
        const cleaned = cacheManager.cleanup();
        if (cleaned.cleanedMemory > 0 || cleaned.cleanedStorage > 0) {
            logManager.info('[后台任务]', 
                `清理了 ${cleaned.cleanedMemory} 条内存缓存，` +
                `${cleaned.cleanedStorage} 条存储缓存`);
        }
    }, 5 * 60 * 1000);
    
    // 每1小时统计一次系统状态
    setInterval(() => {
        const logStats = logManager.getStatistics();
        const cacheStats = cacheManager.getStats();
        
        logManager.info('[后台任务]', '系统状态统计', {
            logs: { total: logStats.total, errors: logStats.errors.length },
            cache: { hitRate: cacheStats.hitRate, memoryUsage: cacheStats.memorySize }
        });
    }, 60 * 60 * 1000);
    
    logManager.success('[后台任务]', '✅ 后台任务初始化完成');
}

// ==========================================
// 示例6：错误处理和恢复
// ==========================================

// 智能错误处理
async function performGradingWithRecovery(student) {
    const operationName = `批改学生${student.name}`;
    
    try {
        logManager.info('[批改]', `开始${operationName}...`);
        
        // 步骤1：获取学生作业
        const homework = await cacheManager.getOrGenerate(
            `homework:${student.id}`,
            () => apiRetryManager.execute(
                () => fetchStudentHomework(student.id),
                { name: '获取作业' }
            ),
            'homeworkData'
        );
        
        // 步骤2：OCR识别
        const text = await performOCR_NEW(homework.image);
        
        // 步骤3：AI分析
        const analysis = await analyzeWithAI_NEW(
            { content: text, type: homework.type },
            student.id
        );
        
        logManager.success('[批改]', 
            `✅ ${operationName}完成，评分：${analysis.score}分`);
        
        return analysis;
    } catch (error) {
        logManager.error('[批改]', 
            `❌ ${operationName}失败: ${error.message}`);
        
        // 根据错误类型采取不同的恢复策略
        if (error.message.includes('timeout')) {
            logManager.warn('[批改]', '网络超时，可能需要稍后重试');
        } else if (error.message.includes('API Key')) {
            logManager.error('[批改]', '配置错误，请检查API Key设置');
        }
        
        throw error;
    }
}

// ==========================================
// 示例7：前端UI集成 - 展示系统状态
// ==========================================

// 在popup中显示系统状态
function displaySystemStats() {
    const logStats = logManager.getStatistics();
    const cacheStats = cacheManager.getStats();
    
    // 日志统计面板
    const logPanel = `
    📊 日志系统
    ├─ 总条数: ${logStats.total}
    ├─ 错误数: ${logStats.errors.length}
    ├─ 警告数: ${logStats.warnings.length}
    └─ 导出: <a href="#" onclick="logManager.downloadLogs('json')">JSON</a>
    `;
    
    // 缓存统计面板
    const cachePanel = `
    💾 缓存系统
    ├─ 命中率: ${cacheStats.hitRate}
    ├─ 内存: ${cacheStats.memorySize}/${100}
    ├─ 存储: ${cacheStats.storageSize} 条
    └─ 清理: <button onclick="cacheManager.cleanup()">立即清理</button>
    `;
    
    console.log(logPanel);
    console.log(cachePanel);
}

// ==========================================
// 示例8：诊断脚本 - 一键诊断系统
// ==========================================

function runDiagnostics() {
    console.log('%c🔍 系统诊断开始', 'color: #0066cc; font-weight: bold; font-size: 16px');
    
    // 检查所有系统是否已加载
    const checks = [
        ['LogManager', typeof logManager !== 'undefined'],
        ['CacheManager', typeof cacheManager !== 'undefined'],
        ['RetryManager (OCR)', typeof ocrRetryManager !== 'undefined'],
        ['RetryManager (AI)', typeof aiRetryManager !== 'undefined'],
        ['RetryManager (API)', typeof apiRetryManager !== 'undefined'],
    ];
    
    console.log('\n✅ 系统加载状态:');
    checks.forEach(([name, loaded]) => {
        console.log(`  ${loaded ? '✅' : '❌'} ${name}`);
    });
    
    // 显示统计信息
    console.log('\n📊 运行统计:');
    logManager.printStatistics();
    
    console.log('\n💾 缓存状态:');
    cacheManager.printStats();
    
    console.log('\n🔄 重试配置:');
    console.log('  OCR:', ocrRetryManager.getStats());
    console.log('  AI:', aiRetryManager.getStats());
    console.log('  API:', apiRetryManager.getStats());
    
    console.log('\n✅ 诊断完成！');
}

// ==========================================
// 示例9：性能监控
// ==========================================

class PerformanceMonitor {
    constructor() {
        this.metrics = {};
    }
    
    start(operationName) {
        this.metrics[operationName] = {
            start: performance.now(),
            startTime: new Date().toISOString()
        };
    }
    
    end(operationName) {
        if (this.metrics[operationName]) {
            const duration = performance.now() - this.metrics[operationName].start;
            this.metrics[operationName].duration = duration;
            
            logManager.info('[性能]', 
                `${operationName}: ${duration.toFixed(2)}ms`);
            
            return duration;
        }
    }
    
    getReport() {
        return Object.entries(this.metrics).map(([name, data]) => ({
            name,
            duration: `${data.duration?.toFixed(2) || 'N/A'}ms`,
            startTime: data.startTime
        }));
    }
}

const perfMonitor = new PerformanceMonitor();

// 使用示例
async function monitoredOCR(image) {
    perfMonitor.start('OCR识别');
    try {
        const result = await performOCR_NEW(image);
        perfMonitor.end('OCR识别');
        return result;
    } catch (error) {
        perfMonitor.end('OCR识别');
        throw error;
    }
}

// ==========================================
// 示例10：完整工作流 - 自动批改一个班的作业
// ==========================================

async function performAutomaticGradingForClass(classId) {
    logManager.info('[自动批改]', `开始批改班级 ${classId} 的所有作业...`);
    
    const startTime = Date.now();
    
    try {
        // 1. 获取学生列表（30分钟缓存）
        logManager.info('[自动批改]', '步骤1: 获取学生列表');
        const students = await getStudentList_NEW(classId);
        logManager.success('[自动批改]', `✅ 获取 ${students.length} 个学生`);
        
        // 2. 获取作业列表
        logManager.info('[自动批改]', '步骤2: 获取作业列表');
        const homeworks = await Promise.all(
            students.map(s => 
                apiRetryManager.execute(
                    () => fetchHomeworkList(s.id),
                    { name: `获取${s.name}的作业列表` }
                )
            )
        );
        
        // 3. 批量分析作业（并发控制）
        logManager.info('[自动批改]', 
            `步骤3: 开始分析作业（共 ${homeworks.flat().length} 份）`);
        
        const results = await analyzeAllStudents_NEW(students);
        
        const duration = (Date.now() - startTime) / 1000;
        const successful = results.filter(r => !r.error).length;
        
        logManager.success('[自动批改]', 
            `✅ 完成！` +
            `\n  成功: ${successful}/${results.length}` +
            `\n  耗时: ${duration.toFixed(0)}秒` +
            `\n  平均: ${(duration/results.length).toFixed(1)}秒/个`);
        
        // 4. 显示统计
        cacheManager.printStats();
        
        return results;
    } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        logManager.error('[自动批改]', 
            `❌ 自动批改失败: ${error.message}` +
            `\n耗时: ${duration.toFixed(0)}秒`);
        throw error;
    }
}

// ==========================================
// 导出示例代码
// ==========================================

console.log('%c✅ 集成示例代码已加载', 'color: #00cc00; font-weight: bold');
console.log('可用的优化函数:');
console.log('  ├─ performOCR_NEW() - 优化的OCR识别');
console.log('  ├─ analyzeWithAI_NEW() - 优化的AI分析');
console.log('  ├─ getStudentList_NEW() - 优化的列表获取');
console.log('  ├─ analyzeAllStudents_NEW() - 优化的批量分析');
console.log('  ├─ performGradingWithRecovery() - 带恢复的批改');
console.log('  ├─ performAutomaticGradingForClass() - 完整工作流');
console.log('  ├─ runDiagnostics() - 系统诊断');
console.log('  └─ initBackgroundTasks() - 后台任务初始化');
console.log('\n立即体验:');
console.log('  runDiagnostics()  // 查看系统状态');
console.log('  logManager.downloadLogs("json")  // 导出日志');
