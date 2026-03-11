// ==========================================
// DOCX 内容分析演示脚本 - DEMO_ANALYSIS.js
// 
// 用途：在浏览器 console 中直接测试内容分析功能
// 
// 使用方法：
//   1. 在浏览器 console 中粘贴本脚本
//   2. 调用 testAnalysis() 或 simulatePreviewReceive()
// ==========================================

// 分析函数副本（与 content.js 中的一致）
const analyzeDocxContent = (rawContent) => {
    console.info('🔍 开始分析DOCX内容...');
    
    const cleanText = (text) => {
        return text
            .replace(/\r\n/g, '\n')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    };
    
    const content = cleanText(rawContent);
    const lines = content.split('\n').filter(line => line.trim());
    
    const analysis = {
        rawContent: content,
        contentLength: content.length,
        lineCount: lines.length,
        questions: [],
        answers: [],
        keyPoints: [],
        structure: {
            hasTitle: false,
            hasQuestions: false,
            hasAnswers: false
        }
    };
    
    // 识别标题
    if (lines.length > 0) {
        const firstLine = lines[0];
        if (firstLine.length < 100 && (firstLine.includes('题') || firstLine.includes('考') || firstLine.includes('练') || firstLine.includes('作业'))) {
            analysis.structure.hasTitle = true;
            analysis.title = firstLine;
        }
    }
    
    let currentQuestion = '';
    let currentAnswer = '';
    let inAnswerSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.includes('答案') || line.includes('参考答案') || line.includes('标准答案')) {
            inAnswerSection = true;
            analysis.structure.hasAnswers = true;
            if (currentQuestion) {
                analysis.questions.push(currentQuestion);
                currentQuestion = '';
            }
            continue;
        }
        
        if (/^[\d一二三四五六七八九十百千万亿]+[\.\)）、]/.test(line)) {
            if (inAnswerSection) {
                if (currentAnswer) {
                    analysis.answers.push(currentAnswer);
                    currentAnswer = '';
                }
            } else {
                if (currentQuestion) {
                    analysis.questions.push(currentQuestion);
                    currentQuestion = '';
                }
                analysis.structure.hasQuestions = true;
            }
        }
        
        if (inAnswerSection) {
            currentAnswer += (currentAnswer ? ' ' : '') + line;
        } else if (line.length > 0) {
            currentQuestion += (currentQuestion ? ' ' : '') + line;
        }
    }
    
    if (currentQuestion) analysis.questions.push(currentQuestion);
    if (currentAnswer) analysis.answers.push(currentAnswer);
    
    analysis.keyPoints = lines
        .filter(line => line.length > 30 && line.length < 200)
        .slice(0, 10);
    
    console.info('✅ 分析完成:', {
        contentLength: analysis.contentLength,
        hasTitle: analysis.structure.hasTitle,
        hasQuestions: analysis.structure.hasQuestions,
        hasAnswers: analysis.structure.hasAnswers,
        questionCount: analysis.questions.length,
        answerCount: analysis.answers.length
    });
    
    return analysis;
};

// ========== 测试函数 1: 基本分析测试 ==========
window.testAnalysis = function() {
    console.group('📊 测试：基本DOCX内容分析');
    
    const testContent = `
第7章 练习题

1. 什么是云计算？
   云计算是一种基于互联网的计算方式，通过网络向用户提供计算服务。

2. 云计算的三个层次是什么？
   答：IaaS（基础设施级类）、PaaS（平台级）和SaaS（软件级）。

3. 以下哪个是云计算的优点？
   A. 成本高
   B. 灵活性强
   C. 难以维护
   D. 物理资源集中

参考答案

1. 云计算是一种基于互联网的计算方式，通过网络向用户提供计算服务。

2. 答：IaaS（基础设施级类）、PaaS（平台级）和SaaS（软件级）。

3. 选项B
    `;
    
    const result = analyzeDocxContent(testContent);
    
    console.log('详细分析结果:', result);
    console.log('标题:', result.title);
    console.log('识别到的题目:', result.questions);
    console.log('识别到的答案:', result.answers);
    console.log('关键点:', result.keyPoints);
    
    console.groupEnd();
    
    return result;
};

// ========== 测试函数 2: 模拟 Preview 页面接收 ==========
window.simulatePreviewReceive = function() {
    console.group('📤 模拟：Preview页面接收分析结果');
    
    const mockData = {
        fileName: 'Chapter7_Exercises.docx',
        fileUrl: 'https://file.zhihuishu.com/attachment/chapter7.docx',
        content: `
第7章 练习题

1. 什么是云计算？
2. 云计算的优点有哪些？
3. 以下属于IaaS的是？
   A. AWS
   B. Office365
   C. Salesforce
   D. GitHub

答案

1. 云计算是一种基于互联网的计算方式。
2. 成本低、灵活性强、可扩展性好。
3. A
        `
    };
    
    // 分析内容
    mockData.analysis = analyzeDocxContent(mockData.content);
    
    // 初始化缓存
    if (!window._zhsPreviewFileResults) {
        window._zhsPreviewFileResults = [];
    }
    
    // 添加到缓存
    window._zhsPreviewFileResults.push({
        ...mockData,
        timestamp: Date.now()
    });
    
    console.log('✅ 已添加到缓存，当前缓存:', window._zhsPreviewFileResults);
    console.log('分析结果:', mockData.analysis);
    
    console.groupEnd();
    
    return mockData;
};

// ========== 测试函数 3: 检查主页面缓存 ==========
window.checkCachedAnalysis = function() {
    console.group('🔍 检查：主页面缓存的分析结果');
    
    if (!window._zhsPreviewFileResults) {
        console.warn('⚠️ 缓存不存在，初始化中...');
        window._zhsPreviewFileResults = [];
    }
    
    console.log(`📎 缓存中共有 ${window._zhsPreviewFileResults.length} 个文件`);
    
    window._zhsPreviewFileResults.forEach((file, idx) => {
        console.group(`文件 ${idx + 1}: ${file.fileName}`);
        console.log('URL:', file.fileUrl);
        console.log('内容长度:', file.content?.length || 0);
        
        if (file.analysis) {
            console.log('分析结果:', {
                title: file.analysis.title,
                线数: file.analysis.lineCount,
                题目数: file.analysis.questions?.length || 0,
                答案数: file.analysis.answers?.length || 0,
                关键点数: file.analysis.keyPoints?.length || 0
            });
            
            if (file.analysis.questions?.length > 0) {
                console.log('前2个题目:', file.analysis.questions.slice(0, 2));
            }
            if (file.analysis.answers?.length > 0) {
                console.log('前2个答案:', file.analysis.answers.slice(0, 2));
            }
        } else {
            console.warn('⚠️ 此文件无分析结果');
        }
        
        console.groupEnd();
    });
    
    console.groupEnd();
};

// ========== 测试函数 4: 文件名匹配测试 ==========
window.testFileMatching = function() {
    console.group('🔍 测试：文件名匹配逻辑');
    
    // 初始化演示缓存
    if (!window._zhsPreviewFileResults || window._zhsPreviewFileResults.length === 0) {
        window._zhsPreviewFileResults = [
            {
                fileName: 'Ex.  7.docx',  // 注意：两个空格
                fileUrl: 'https://example.com/ex7.docx',
                analysis: { questions: ['Q1'], answers: ['A1'] }
            },
            {
                fileName: 'Exercise 8.docx',
                fileUrl: 'https://example.com/ex8.docx',
                analysis: { questions: ['Q2'], answers: ['A2'] }
            }
        ];
    }
    
    // 测试多个文件名变体
    const testNames = [
        'Ex. 7.docx',      // 单空格（应该匹配）
        'Ex.  7.docx',     // 双空格
        'Ex.7.docx',       // 无空格
        'ex.7.docx',       // 小写
        'EX.7.DOCX',       // 大写
        'Exercise 8.docx', // 其他文件
    ];
    
    testNames.forEach(testName => {
        console.group(`测试文件名: "${testName}"`);
        
        const normalizedFileName = testName.replace(/\s+/g, '').toLowerCase();
        const matchedResult = window._zhsPreviewFileResults.find(result => {
            if (!result.fileName) return false;
            const normalizedResultName = result.fileName.replace(/\s+/g, '').toLowerCase();
            return normalizedResultName === normalizedFileName ||
                   normalizedResultName.includes(normalizedFileName) ||
                   normalizedFileName.includes(normalizedResultName);
        });
        
        if (matchedResult) {
            console.log('✅ 匹配成功:', {
                原始名称: matchedResult.fileName,
                搜索名称: testName,
                URL: matchedResult.fileUrl?.substring(0, 60) + '...',
                分析结果: matchedResult.analysis ? '有' : '无'
            });
        } else {
            console.log('❌ 未匹配');
        }
        
        console.groupEnd();
    });
    
    console.groupEnd();
};

// ========== 测试函数 5: 清空缓存 ==========
window.clearAnalysisCache = function() {
    window._zhsPreviewFileResults = [];
    console.log('✅ 已清空分析结果缓存');
};

// ========== 导出所有测试函数 ==========
console.log(`
✅ 已加载 DOCX 内容分析演示脚本

[可用的测试函数]
1. testAnalysis()              - 基本分析测试，使用示例DOCX内容
2. simulatePreviewReceive()    - 模拟Preview页面接收分析结果
3. checkCachedAnalysis()       - 查看主页面缓存的所有分析结果
4. testFileMatching()          - 测试文件名匹配逻辑
5. clearAnalysisCache()        - 清空分析缓存

[立即执行：在下面输入函数名并按Enter]
  testAnalysis()
`);
