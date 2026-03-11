# 🚀 快速测试指南 - DOCX分析改进 (2026-03-07)

## ⚡ 立即测试（3分钟）

### 步骤 1: 重新加载扩展

```
1. 按 Ctrl+Shift+J 打开开发者工具
2. 在Console中执行：
   location.reload()  // 完整刷新页面
3. 等待扩展重新加载
```

### 步骤 2: 打开作业分析

```
1. 访问智慧树作业详情页
2. 在页面右下角找到"浮窗球"
3. 点击→选择"作业分析"
```

### 步骤 3: 观察 Console 日志

**关键日志位置**：
- 搜索 `[主页面]` ← 显示接收到的文件
- 搜索 `[文件分析]` ← 显示匹配的分析结果
- 搜索 `[最终等待]` ← 显示正在等待第二个文件

### 步骤 4: 快速验证

在 Console 中执行：

```javascript
// 验证1: 文件数量
console.log('✅ 收到的文件数:', window._zhsPreviewFileResults.length);

// 验证2: 题目数量
const file1 = window._zhsPreviewFileResults[0];
console.log('✅ Ex.7.docx的题目数:', file1.analysis?.questions?.length);
console.log('✅ Ex.7.docx的答案数:', file1.analysis?.answers?.length);

// 验证3: 第二个文件（如果有）
if (window._zhsPreviewFileResults.length > 1) {
    const file2 = window._zhsPreviewFileResults[1];
    console.log('✅ Ex.8.docx的题目数:', file2.analysis?.questions?.length);
} else {
    console.log('❌ 没有收到第二个文件');
}

// 验证4: 查看完整题目
console.log('\n=== 题目详情 ===');
file1.analysis.questions.forEach((q, i) => {
    console.log(`Q${i+1}: ${q.substring(0, 80)}...`);
});

console.log('\n=== 答案详情 ===');
file1.analysis.answers.forEach((a, i) => {
    const explanation = file1.analysis.answerExplanations[i];
    console.log(`A${i+1}: ${a}`);
    if (explanation) console.log(`  解析: ${explanation.substring(0, 80)}...`);
});
```

## ✅ 预期结果

### 正常情况
```
✅ 收到的文件数: 2

✅ Ex.7.docx的题目数: 5
✅ Ex.7.docx的答案数: 5

✅ Ex.8.docx的题目数: 3

=== 题目详情 ===
Q1: 1. Which of the following infinitives (不定式）functions as an adverbial?...
Q2: 2. What does "would rather" usually mean?...

=== 答案详情 ===
A1: B
  解析: Because it functions as an adverbial modifier...
A2: Prefer to
  解析: This expression indicates preference...
```

### 异常情况（需要继续调试）

❌ **只有1个文件**
```
✅ 收到的文件数: 1  // ← 问题：应该是2
```
→ 继续看："为什么只有1个文件"部分

❌ **题目很少**
```
✅ Ex.7.docx的题目数: 1  // ← 问题：应该是5
```
→ 继续看："为什么题目不完整"部分

## 🔍 常见问题排查

### 问题 1: 为什么还是只有1个文件

**检查日志**（Ctrl+F搜索）：
- `[最终等待]` ← 检查是否有这个日志

**可能原因**：
- Preview标签页没打开
- Preview标签页太快关闭了
- 网络延迟

**快速调试命令**：
```javascript
// 查看Preview标记是否还活跃
console.log('Preview处理中:', window._zhsPreviewProcessing);

// 查看所有已拦截的preview URL
console.log('Preview URLs:', window._zhsInterceptedPreviewUrls);
```

**解决方案**：
- 延长等待时间：修改第4821行 `waitCount < 5` 改为 `waitCount < 10`
- 增加最终等待次数：修改第5000行 `finalWait <= 5` 改为 `finalWait <= 10`

### 问题 2: 为什么题目不完整

**检查原始内容**：
```javascript
// 查看第一个文件的原始提取内容
console.log(window._zhsPreviewFileResults[0].content);
```

**可能原因**：
- DOCX文件本身就不完整
- DOCX解析有问题
- 题目编号格式不标准

**快速检查**：
```javascript
const content = window._zhsPreviewFileResults[0].content;

// 检查是否有 "2." "3." 等
console.log('文本中有"2.":', content.includes('2.'));
console.log('文本中有"3.":', content.includes('3.'));

// 检查是否有 "B." "C." "D." 等选项
console.log('文本中有"B.":', content.includes('B.'));
console.log('文本中有"C.":', content.includes('C.'));
```

**解决方案**：
- 如果原始内容就不完整 → DOCX文件本身的问题
- 如果原始内容完整但题目数少 → 需要改进分析正则

### 问题 3: 答案为0

**检查**：
```javascript
// 查看原始内容中是否有"答案"关键词
const content = window._zhsPreviewFileResults[0].content;
console.log('有"答案":', content.includes('答案'));
console.log('有"Answer":', content.includes('Answer'));
console.log('有"标准答案":', content.includes('标准答案'));

// 找到答案区块的位置
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('答案') || line.includes('Answer')) {
        console.log(`第${i}行找到答案标签:`, line);
    }
});
```

**可能原因**：
- DOCX中没有"答案"区块
- 答案区块在题目之前而不是之后
- 答案区块使用了不同的关键词格式

**解决方案**：
- 在第 190 行添加更多答案关键词识别
- 改为向前和向后扫描答案

## 📊 性能注意

- **总等待时间**：约11.5秒（用于2个文件）
  - 第一个文件：5秒循环 + 1.5秒额外等待
  - 等待间隙：1秒
  - 第二个文件：5秒循环 + 1.5秒额外等待

- **CPU使用**：最小（异步等待）

- **内存占用**：增加约100KB（每个分析的文件）

## 🎯 验收标准

| 指标 | 标准 | 检查方法 |
|------|------|---------|
| 文件数 | 应为2 | `window._zhsPreviewFileResults.length === 2` |
| 题目数 | >1 | `analysis.questions.length > 1` |
| 答案数 | >0 | `analysis.answers.length > 0` |
| 选项完整 | 有A/B/C/D | `questions.join().match(/[A-D]\./g)` |
| 解析分离 | 有分析 | `analysis.answerExplanations.length > 0` |

## 📞 如果仍有问题

1. **收集日志**
   ```javascript
   // 复制所有相关日志
   console.log('完整Analysis:', 
     JSON.stringify(window._zhsPreviewFileResults, null, 2)
   );
   ```

2. **检查特定部分**
   - content.js 第 111-229 行：分析逻辑
   - content.js 第 244-256 行：Preview标记
   - content.js 第 4817-4825 行：等待逻辑

3. **逐行调试**
   - 在关键位置添加 `debugger;`
   - 打开DevTools逐步执行
   - 观察变量变化

---

**一键测试脚本**（复制粘贴到Console）：

```javascript
const summary = {
    文件数: window._zhsPreviewFileResults.length,
    第1个文件: {
        名称: window._zhsPreviewFileResults[0]?.fileName,
        题目数: window._zhsPreviewFileResults[0]?.analysis?.questions?.length,
        答案数: window._zhsPreviewFileResults[0]?.analysis?.answers?.length,
        解析数: window._zhsPreviewFileResults[0]?.analysis?.answerExplanations?.length,
    },
    第2个文件: window._zhsPreviewFileResults[1] ? {
        名称: window._zhsPreviewFileResults[1].fileName,
        题目数: window._zhsPreviewFileResults[1]?.analysis?.questions?.length,
    } : '未收到'
};
console.table(summary);
```

---
**最后更新**: 2026-03-07  
**测试链接**: [DOCX_ANALYSIS_IMPROVEMENT_2026-03-07.md](./DOCX_ANALYSIS_IMPROVEMENT_2026-03-07.md)
