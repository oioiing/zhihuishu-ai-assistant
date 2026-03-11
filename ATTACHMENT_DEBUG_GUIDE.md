# 附件解析问题调试指南

## 问题描述
当扩展显示"✅ 附件处理完成"，但AI分析时仍报告"附件下载失败，无法获取题目内容"。

## 已添加的详细调试日志

### 1. **content.js 中的日志**（在浏览器Console中，带 `🎓` 图标）
```
📎 [附件1] 文件名: Ex.7.docx
📎 [附件1] 内容长度: 123 字符
📎 [附件1] 内容预览: (实际内容的前100个字符)
⚠️ [附件1] 检测到错误信息: (仅在内容包含"失败"等词时显示)
📎 [作业分析] 附件摘要长度: 456 字符
```

### 2. **background.js 中的日志**（在Extension Service Worker中）
```
📎 [附件处理] 开始处理: Ex.7.docx
📎 [附件处理] URL: https://...
⬇️ [附件处理] 开始下载: Ex.7.docx
✅ [附件处理] 下载成功: Ex.7.docx (12345 字节)
🔍 [附件处理] 开始解析: Ex.7.docx
📄 [Docx解析] 开始解析，Blob大小: 12345 字节
📄 [Docx解析] 找到 X 个 <w:t> 标签
📄 [Docx解析] 最终提取文本 X 字符
✅ [附件处理] 解析完成: Ex.7.docx (提取 X 字符)
📊 [AI分析] attachmentSummary预览: 【Ex.7.docx】内容...
```

## 调试步骤

### 第一步：打开开发者工具
1. 在作业详情页面，按 `F12` 打开开发者工具
2. 切换到 **Console** 标签

### 第二步：查看Service Worker日志
1. 在Chrome地址栏输入：`chrome://extensions/`
2. 找到"智慧树AI助手"扩展
3. 点击 **"Service Worker"** 链接（在"检查视图"下方）
4. 会打开一个新的调试窗口

### 第三步：触发分析流程
1. 在作业详情页面点击"分析作业"按钮
2. **同时观察**两个Console窗口的输出

### 第四步：检查关键日志

#### ✅ **正常情况应该看到：**
```
// 页面Console (content.js)
📎 [附件1] 文件名: Ex.7.docx
📎 [附件1] 内容长度: 1234 字符
📎 [附件1] 内容预览: Exercise 7 1. Choose the correct...
📎 [作业分析] 附件摘要长度: 400 字符

// Service Worker Console (background.js)
📄 [Docx解析] 找到 150 个 <w:t> 标签
📄 [Docx解析] 最终提取文本 1234 字符
✅ [附件处理] 解析完成: Ex.7.docx (提取 1234 字符)
📊 [AI分析] attachmentSummary预览: 【Ex.7.docx】Exercise 7...
```

#### ❌ **异常情况会看到：**

**情况1：下载失败**
```
❌ [附件处理] 下载失败: Ex.7.docx
📎 [附件1] 内容预览: (下载失败 - 文件URL无法访问或网络错误)
```
**原因**：URL无效或网络问题
**解决方案**：检查附件URL是否正确提取

**情况2：DOCX解析失败**
```
✅ [附件处理] 下载成功: Ex.7.docx (12345 字节)
📄 [Docx解析] 找到 0 个 <w:t> 标签
⚠️ [Docx解析] 方法1提取内容不足，尝试方法2...
📄 [Docx解析] 最终提取文本 0 字符
📎 [附件1] 内容预览: (无法解析文本 - DOCX文件可能使用了特殊格式...)
```
**原因**：DOCX文件格式特殊，简单正则无法提取
**解决方案**：需要升级到完整的DOCX解析库（如mammoth.js）

**情况3：内容过短**
```
✅ [附件处理] 解析完成: Ex.7.docx (提取 5 字符)
⚠️ [附件处理] 内容无效或过短: Ex.7.docx - "(无法..."
```
**原因**：解析出来的内容太少，可能只是标题或元数据
**解决方案**：需要改进解析策略

**情况4：没有传递给AI**
```
📎 [作业分析] 附件内容已合并到分析数据
⚠️ [AI分析] attachmentSummary为空，AI将无法看到附件内容！
```
**原因**：parseResult虽然有数据，但attachmentSummary没有生成
**解决方案**：检查content.js中的数据传递逻辑

## 改进措施

### 已实施的改进：

1. **增强DOCX解析**（三层降级策略）
   - 方法1：标准`<w:t>`标签提取
   - 方法2：`<v:textbox>`等其他文本容器
   - 方法3：粗暴全文本提取（去除所有XML标签）

2. **详细日志输出**
   - 每个步骤都有明确的状态日志
   - 关键数据的预览（前100字符）
   - 错误信息的具体描述

3. **数据验证**
   - 检查content是否包含"失败"等错误信息
   - 检查content长度是否足够（>10字符）
   - 在AI分析前验证attachmentSummary是否存在

### 如果仍然无法解析：

#### 方案A：手动复制内容
临时解决方案：在"手动设置评分标准"中直接粘贴题目内容

#### 方案B：升级为完整的DOCX解析库
需要集成mammoth.js或docx.js等专业库：

```javascript
// 需要在manifest.json中添加库文件
import mammoth from 'mammoth';

async function parseDocxContent(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}
```

#### 方案C：服务端解析
通过后端服务器进行DOCX解析，避免浏览器端限制

## 测试用例

测试文件：`Ex.7.docx`, `Ex.8.docx`

**预期行为**：
1. URL提取成功 ✅
2. 文件下载成功（Blob size > 0）✅
3. DOCX解析提取到文本（length > 100）❓
4. attachmentSummary传递给AI ❓

**当前状态**：前两步成功，后两步需要进一步验证

## 联系与反馈

请运行测试后，提供以下信息：
1. 页面Console中的完整日志（带📎标记的部分）
2. Service Worker Console中的完整日志（带📄标记的部分）
3. 附件文件的实际内容截图（如果能打开.docx文件）

基于这些信息，可以进一步诊断问题并提供精确的解决方案。
