# 文档内容分析功能测试指南

## 功能概述

已在Preview页面的内容脚本中添加了DOCX内容分析功能，自动识别：
- 文档标题
- 题目内容与编号
- 答案部分
- 关键点

## 架构

```
用户点击附件
  ↓
主页面：content.js 检测到 click 事件
  ↓
预览页面自动打开（window.open 拦截）
  ↓
Preview 页面 content.js 执行（lines 82-290）
  ↓
1. 解码文件URL和文件名
2. 发送给 background 下载+解析DOCX
3. 调用 analyzeDocxContent() 分析文本
4. 发送 postMessage 到主页面
  ↓
主页面接收消息（lines 305-349）
  ↓
缓存到 window._zhsPreviewFileResults[]
  ↓
附件提取循环匹配文件名
  ↓
如果匹配成功，在日志中显示分析结果
```

## 测试检查点

### 1. Preview页面分析（console日志）

**预期看到的日志：**

```
✅ [Preview页面] 内容分析完成: {
    contentLength: 2150
    hasTitle: true
    hasQuestions: true
    hasAnswers: true
    questionCount: 7
    answerCount: 3
}

📝 [Preview页面] 前3个识别到的题目: 
    1. "1. 什么是XXX..."
    2. "2. XXX的作用是..."
    
✅ [Preview页面] 前3个识别到的答案:
    1. "1. A. 正确的答案..."
```

### 2. 主页面接收分析结果（console日志）

**预期看到的日志：**

```
✅ [主页面] 收到preview页面的文件信息: {
    fileName: "Ex. 7.docx"
    fileUrl: "https://file.zhihuishu.com/.../xxx.docx"
    contentLength: 2150
    hasAnalysis: true
}

📊 [主页面] 文件内容分析: {
    title: "第7章 练习题"
    structure: {
        hasTitle: true
        hasQuestions: true
        hasAnswers: true
    }
    questionCount: 7
    answerCount: 3
    keyPointCount: 5
}

📝 [主页面] 前3个识别到的题目:
    1. 1. 什么是XXX... 
    2. 2. XXX的作用是...

✅ [主页面] 前3个识别到的答案:
    1. 1. A. 正确的答案...
```

### 3. 附件提取循环中的分析结果（console日志）

**预期看到的日志：**

```
✅ [Preview通信] 第2次尝试：找到匹配文件 "Ex. 7.docx"

📊 [文件分析] 已识别到分析结果: {
    title: "第7章 练习题"
    hasQuestions: true
    questionCount: 7
    hasAnswers: true
    answerCount: 3
}

📝 [文件分析] 第1个题目: 1. 什么是XXX...

✅ [文件分析] 第1个答案: 1. A. 正确的答案...
```

## 分析逻辑详解

位置：`src/content/content.js` 第 85-140 行

```javascript
const analyzeDocxContent = (rawContent) => {
    // 1️⃣  规范化文本
    //    - 替换 \r\n → \n
    //    - 移除零宽字符
    //    - trim去两端空格
    
    // 2️⃣  按行分割并清理
    //    const lines = content.split('\n').filter(line => line.trim());
    
    // 3️⃣  初始化分析对象
    //    {
    //        fileName, fileUrl, rawContent,
    //        contentLength, lineCount,
    //        questions: [],
    //        answers: [],
    //        keyPoints: [],
    //        structure: {
    //            hasTitle: false,
    //            hasQuestions: false,
    //            hasAnswers: false
    //        }
    //    }
    
    // 4️⃣  识别标题（第一行，<100字符，包含特定关键词）
    //    if (firstLine.includes('题|考|练|作业'))
    
    // 5️⃣  扫描所有行：
    //    a. 检测答案区块开始（包含'答案|参考答案|标准答案'）
    //    b. 检测题目开始（数字+句号/括号：'^[0-9一二三...]+[.)）、]'）
    //    c. 在不同区段累积内容
    
    // 6️⃣  提取关键点（30-200字符的段落）
}
```

## 限制与改进方向

### 当前限制

1. **题目识别**: 只支持中文数字和阿拉伯数字编号格式
2. **答案分离**: 只能识别标准"答案"区块，无法处理混合格式
3. **选项解析**: 暂未解析 ABCD 选项（只是作为答案内容的一部分）
4. **多选题**: 无法区分单选、多选、填空等题型

### 改进计划

1. **题型检测**
   - 识别选项格式（A. B. C. D.）→ 多选题
   - 识别 ___  → 填空题
   - 识别数学符号 → 计算题

2. **答案关联**
   - 建立题目编号到答案的映射
   - 提取题目选项

3. **内容结构化**
   ```javascript
   {
       questions: [
           {
               number: 1,
               text: "What is XXX?",
               type: "multiple-choice",
               options: {
                   A: "Option A",
                   B: "Option B",
                   C: "Option C",
                   D: "Option D"
               },
               correctAnswer: "B",
               explanation: "Because..."
           }
       ],
       answers: [...]
   }
   ```

## 使用 console 测试

### 检查 Preview 页面结果

在 **Preview 标签页** 的 Chrome DevTools 中运行：

```javascript
// 查看当前 Preview 页面的分析结果
console.log('Preview 页面结果:', window._zhsPreviewFileResult);

// 查看分析内容
if (window._zhsPreviewFileResult?.analysis) {
    const analysis = window._zhsPreviewFileResult.analysis;
    console.log('标题:', analysis.title);
    console.log('题目数:', analysis.questions.length);
    console.log('答案数:', analysis.answers.length);
    console.log('第1个题目:', analysis.questions[0]);
}
```

### 检查主页面接收的结果

在 **主页面** 的 Chrome DevTools 中运行：

```javascript
// 查看从 Preview 页面接收的所有文件信息
console.log('主页面缓存文件:', window._zhsPreviewFileResults);

// 查看最新接收的文件
const lastFile = window._zhsPreviewFileResults[window._zhsPreviewFileResults.length - 1];
if (lastFile?.analysis) {
    console.log('最新文件分析:', lastFile.analysis);
}
```

## 调试命令

### 模拟接收分析结果（主页面）

```javascript
// 测试主页面的消息处理
window.postMessage({
    type: 'ZHS_PREVIEW_FILE_READY',
    data: {
        fileName: 'Test.docx',
        fileUrl: 'https://example.com/test.docx',
        content: '测试内容\n1. 第一道题\n2. 第二道题\n\n答案\n1. A',
        analysis: {
            fileName: 'Test.docx',
            title: '测试文档',
            questions: ['第一道题', '第二道题'],
            answers: ['A', 'B'],
            structure: {
                hasTitle: true,
                hasQuestions: true,
                hasAnswers: true
            }
        }
    }
}, '*');

// 然后检查缓存
console.log(window._zhsPreviewFileResults);
```

## Console 日志过滤

Find the analysis-related logs:

```
Filter: [文件分析]
Filter: [Preview页面]
Filter: [主页面]
```

## 下一步

实现后可以进行：

1. **导出分析结果**：保存到 Chrome Storage
2. **UI 展示**：在 popup 或 content 页面显示识别的题目/答案
3. **AI 集成**：将分析结果发送给 AI 助手进行更深层次的分析
4. **缓存优化**：对已分析过的文件进行缓存，避免重复分析
