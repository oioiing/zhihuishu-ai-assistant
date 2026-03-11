# 详细诊断指南 - 附件处理流程追踪（2026-03-06 升级版）

## 🎯 问题症状

你看到的是：
```
📊 [AI分析] homeworkDetails.attachmentContents: 0  ❌
📊 [AI分析] attachmentSummary存在: false  ❌
⚠️ [AI分析] attachmentSummary为空，AI将无法看到附件内容！
```

**含义**：虽然系统识别到了 2 个附件，但没有成功获取它们的内容。

---

## 🔍 完整诊断流程

本次升级添加了**11个关键诊断点**，可以精确定位问题出在哪一步。

### 第一步：打开两个 Console 窗口

#### Console 1 - 页面 Console（F12）
```
浏览器 → 作业详情页面 → F12 → Console 标签
```

#### Console 2 - Service Worker Console
```
chrome://extensions/ → 找到扩展 → 点击"Service Worker"
```

### 第二步：点击"分析作业"按钮

同时观察两个 Console 的输出。

### 第三步：查找关键日志点

---

## 📊 诊断日志地图

### **诊断点 1-3：URL 提取阶段**

**页面 Console 中应该看到：**

```
📎 [作业分析] 开始处理附件...
📎 [作业分析] 开始提取附件URL...
📎 [作业分析] 提取完成，得到 2 个结果
📎 [作业分析] 有效URL: 2 个
📎 [URL1] 名称: Ex.7.docx
📎 [URL1] 地址: https://file.zhihuishu.com/...Ex.7.docx
📎 [URL1] 方法: 自动点击预览提取
📎 [URL2] 名称: Ex.8.docx
📎 [URL2] 地址: https://file.zhihuishu.com/...Ex.8.docx
📎 [URL2] 方法: 自动点击预览提取
```

**如果这里缺少日志或 URL 为空：**
```
❌ 问题：URL 提取失败
✅ 解决方案：检查页面是否正确加载了附件列表
```

---

### **诊断点 4-5：发送给后台**

**页面 Console 中应该看到：**

```
📎 [作业分析] 准备下载 2 个附件
📎 [作业分析] 发送消息给background.js开始下载...
```

**如果没有这两行：**
```
❌ 问题：URL 提取步骤出错或没有有效 URL
```

---

### **诊断点 6-7：后台下载反馈**

**此时 Service Worker Console 中应该看到：**

```
📎 [Background] 附件下载请求
📎 [Background] 需要处理 2 个文件
📎 [Background] URL1: Ex.7.docx -> https://file.zhihuishu.com/...
📎 [Background] URL2: Ex.8.docx -> https://file.zhihuishu.com/...
📎 [附件批处理] 开始处理 2 个文件
⬇️ [附件处理] 开始处理: Ex.7.docx
⬇️ [附件处理] URL: https://file.zhihuishu.com/...
⬇️ [附件下载] 开始下载
   URL: https://file.zhihuishu.com/...
   URL长度: 84 字符
   URL协议: https://fi
```

**如果出现 CSP 错误：**
```
❌ Connecting to '...' violates the following Content Security Policy...
✅ 解决方案：检查是否重新加载了扩展（manifest.json 已修复，需要重新加载）
```

**如果出现 HTTP 错误：**
```
❌ HTTP状态: 404 Not Found
   错误信息: Failed to fetch
✅ 可能的原因：URL 本身无效或指向了已删除的文件
```

---

### **诊断点 8：下载成功状态**

**Service Worker Console 中应该看到：**

```
   HTTP状态: 200 OK
   Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
✅ [附件下载] 成功: 45678 字节, 类型: application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

**如果显示 0 字节：**
```
❌ [附件下载] 成功: 0 字节
✅ 问题：下载的是空文件或预览页面 HTML
✅ 解决方案：URL 可能是预览页面而非直接下载
```

---

### **诊断点 9：DOCX 解析**

**Service Worker Console 中应该看到：**

```
🔍 [附件处理] 开始解析: Ex.7.docx
📄 [Docx解析] 开始解析，Blob大小: 45678 字节
📄 [Docx解析] 解码后文本长度: 45678 字符
📄 [Docx解析] 找到 150 个 <w:t> 标签
📄 [Docx解析] 最终提取文本 1234 字符
📄 [Docx解析] 前100字符预览: Exercise 7...
✅ [附件处理] 解析完成: Ex.7.docx (提取 1234 字符)
```

**如果找到 0 个标签：**
```
📄 [Docx解析] 找到 0 个 <w:t> 标签
⚠️ [Docx解析] 方法1失败，尝试方法2...
📄 [Docx解析] 最终提取文本 0 字符
📄 [Docx解析] 前100字符预览: (无法解析文本 - DOCX文件可能使用了特殊格式...)
```

**可能原因**：
- DOCX 文件格式特殊
- 文件内容为空
- 文件已损坏

---

### **诊断点 10：批处理统计**

**Service Worker Console 中应该看到：**

```
✅ [附件批处理] 完成 2 个文件 (成功: 2, 失败: 0)
✅ [附件1] Ex.7.docx - 1234 字符 - Exercise 7 Question 1. Choose...
✅ [附件2] Ex.8.docx - 2345 字符 - Exercise 8 Multiple choice...
📎 [Background] 附件处理完成，返回 2 个结果
📎 [Background返回1] Ex.7.docx - 1234 字符
📎 [Background返回2] Ex.8.docx - 2345 字符
```

**如果显示失败：**
```
✅ [附件批处理] 完成 2 个文件 (成功: 0, 失败: 2)
❌ [附件1] Ex.7.docx - 23 字符 - (下载失败 - 文件URL无法访问或网络错误)
```

---

### **诊断点 11：页面端接收结果**

**页面 Console 中应该看到：**

```
📎 [作业分析] 收到background.js响应
   response: {success: true, attachments: Array(2)}
   success: true
   attachments长度: 2
📎 [作业分析] parseResult.length = 2
✅ [作业分析] 进入合并逻辑
📎 [附件1] 文件名: Ex.7.docx
📎 [附件1] 内容长度: 1234 字符
📎 [附件1] 内容预览: Exercise 7 Question 1...
📎 [附件2] 文件名: Ex.8.docx
📎 [附件2] 内容长度: 2345 字符
📎 [附件2] 内容预览: Exercise 8 Questions...
📎 [作业分析] 附件内容已合并到分析数据
📎 [作业分析] 附件摘要长度: 3579 字符
```

**如果 parseResult.length = 0：**
```
📎 [作业分析] parseResult.length = 0
⚠️ [作业分析] parseResult为空，无法获取附件内容
```

**此时检查 background 的返回值**：
```
📎 [Background返回1] Ex.7.docx - 23 字符 - (下载失败...)
```

---

## 🎯 快速诊断决策树

### 问题 1：URL 提取失败
```
症状：
  📎 [URL1] 地址: (未找到链接)
  或者根本没有 URL 日志
  
原因：
  1. 页面没有正确加载附件列表
  2. 附件 DOM 结构已变化
  3. 自动点击预览失败
  
解决方案：
  - 在页面手动点击附件预览，确认能打开
  - 检查浏览器 Console 是否有错误
  - 如果自动点击失败，需要更新选择器
```

### 问题 2：下载失败（CSP 错误）
```
症状：
  Connecting to '...' violates the following Content Security Policy...

原因：
  CSP 限制（虽然已修复，但需要重新加载）

解决方案：
  1. 打开 chrome://extensions/
  2. 找到扩展，点击 🔄 刷新
  3. 刷新作业详情页面
  4. 重新点击"分析作业"
```

### 问题 3：下载失败（HTTP 错误）
```
症状：
  HTTP状态: 404 / Refused to connect / Failed to fetch
  ❌ [附件下载] 失败

原因：
  1. URL 无效
  2. 文件已删除
  3. 网络问题

解决方案：
  - 复制日志中的 URL
  - 粘贴到浏览器地址栏测试是否能直接访问
  - 如果不能访问，说明 URL 提取有问题
```

### 问题 4：下载 0 字节
```
症状：
  ✅ [附件下载] 成功: 0 字节
  或
  下载的内容是 HTML（预览页面）而非 DOCX

原因：
  URL 指向的是预览页面而非直接文件

解决方案：
  - 需要增强 URL 提取逻辑，从预览页面中提取真实下载链接
  - 这可能需要对特定平台的适配
```

### 问题 5：DOCX 解析失败
```
症状：
  📄 [Docx解析] 找到 0 个 <w:t> 标签
  📄 [Docx解析] 最终提取文本 0 字符
  📄 [Docx解析] 前100字符预览: (无法解析文本 - DOCX文件可能使用了特殊格式...)

原因：
  1. DOCX 使用了特殊的格式（如表格、文本框、形状）
  2. 文件内容为空或损坏
  3. 简单的正则表达式无法处理复杂结构

解决方案：
  - 短期：需要集成专业的 DOCX 解析库（mammoth.js）
  - 当前：可以手动下载附件，复制内容
```

---

## 💡 应急方案

如果经过完整诊断仍然无法解决，使用应急方案：

### 步骤 1：手动下载附件
在页面上找到附件，手动下载 Ex.7.docx 和 Ex.8.docx 到本地

### 步骤 2：使用手动编辑模式
1. 点击扩展"手动设置评分标准"按钮
2. 用 Word 或其他工具打开下载的附件
3. 复制题目内容
4. 粘贴到"作业内容"字段
5. 系统会基于你提供的内容生成答案

### 步骤 3：完成分析
系统会根据手动提供的题目内容生成完整的评分标准和参考答案

---

## 📝 报告问题时需要提供的信息

请按顺序复制以下日志区间的完整内容：

**必需信息**（复制这些区间）：
1. 从 `📎 [作业分析] 开始处理附件...` 到 `📎 [作业分析] 附件摘要长度:`
2. Service Worker 中从 `📎 [Background] 附件下载请求` 到 `📎 [Background] 附件处理完成`

**可选信息**：
3. 整个诊断过程的截图

**诊断结果模板**：
```
URL 提取：✅/❌
下载：✅/❌ (HTTP 状态: ___)
DOCX 解析：✅/❌ (找到 ___ 个标签)
内容合并：✅/❌ (长度: ___ 字符)
```

---

## 📞 技术支持

基于上述 11 个诊断点的日志，可以精确判断问题位置，并实施对应的修复方案。

