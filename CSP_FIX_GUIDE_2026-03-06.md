# Content Security Policy (CSP) 修复说明 - 2026-03-06

## 🎯 问题诊断

你遇到的错误：
```
Connecting to 'https://file.zhihuishu.com/...' violates the following 
Content Security Policy directive: "connect-src 'self' https://api.deepseek.com..."
```

**根本原因**：Chrome 扩展程序的 Content Security Policy（内容安全策略）限制了可以访问的域名。

---

## ✅ 已实施的两项修复

### 修复 1：扩展 CSP 白名单（manifest.json）

**之前**：
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; connect-src 'self' https://api.deepseek.com https://*.deepseek.com https://api.ocr.space; object-src 'self'"
}
```

**现在**：
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; connect-src 'self' https://api.deepseek.com https://*.deepseek.com https://api.ocr.space https://file.zhihuishu.com https://prod-polymas.oss-cn-hangzhou.aliyuncs.com; object-src 'self'"
}
```

**新增允许的域名**：
- ✅ `https://file.zhihuishu.com` - 智慧树附件服务器
- ✅ `https://prod-polymas.oss-cn-hangzhou.aliyuncs.com` - 阿里云OSS存储

### 修复 2：改进 URL 提取逻辑（content.js）

**问题**：之前的评分系统给 `.js` 文件和 `.docx` 文件相同的权重，导致选择了错误的URL

**改进**：
1. **白名单模式**：`.docx` 等文档文件优先级最高
2. **黑名单模式**：排除 `.js`, `.css`, `.map` 等非文档文件
3. **更详细的评分**：
   - `.docx/.doc`: +10 分
   - `.xlsx/.xls`: +9 分
   - `.pdf`: +7 分
   - `.js/.css/.map`: -5 分（降分）
4. **详细调试日志**：显示所有候选URL和评分结果

---

## 🚀 如何应用修复

### 方法 1：自动更新（推荐）
1. 删除旧扩展：
   - 打开 `chrome://extensions/`
   - 找到"智慧树 AI 助教"
   - 点击"删除"按钮
   
2. 重新加载新版本：
   - 在 `chrome://extensions/` 中打开"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

### 方法 2：手动修改文件
如果已经加载了扩展，可以手动修改两个文件：

**文件 1**: `manifest.json`
- 找到 `"content_security_policy"` 字段
- 在 `connect-src` 的值中添加：`https://file.zhihuishu.com https://prod-polymas.oss-cn-hangzhou.aliyuncs.com`

**文件 2**: `src/content/content.js`
- 找到 `pickBestUrl()` 和 `isUsefulFileUrl()` 函数
- 替换成新版本（支持 `.docx` 优先级）

### 方法 3：仅修改 CSP（如果只在乎快速修复）
只修改 `manifest.json` 中的 CSP 行，然后：
1. 打开 `chrome://extensions/`
2. 找到扩展，点击 🔄 刷新

---

## 📊 修复效果验证

修复后，你应该看到以下日志序列：

### ✅ 成功情况
```
页面 Console：
📎 [URL1] 名称: Ex.7.docx
📎 [URL1] 地址: https://file.zhihuishu.com/...ex7.docx  ✅ (现在应该是 .docx)
📎 [URL1] 方法: 自动点击预览提取

📎 [URL评分] 候选URL显示和排序结果

Service Worker Console：
⬇️ [附件下载] 开始下载
   URL: https://file.zhihuishu.com/...ex7.docx
   ✅ HTTP状态: 200 OK
✅ [附件下载] 成功: 12345 字节
```

### ❌ 仍然失败原因排查

**情况 1**：仍然看到 `.js` 文件
```
原因：修改未生效，扩展未重新加载
解决：
1. 在 chrome://extensions 中点击 🔄 刷新
2. 重新刷新作业详情页面
```

**情况 2**：看到 CORS 错误（而不是 CSP 错误）
```
Fetch error: CORS policy...
原因：服务器的跨域设置阻止访问（与扩展无关）
解决：需要实施备用方案（手动下载）
```

**情况 3**：看到其他错误
```
请复制完整的 Service Worker 日志，可能需要进一步调查
```

---

## 🔍 附加信息

### 为什么需要 CSP？
- 保护用户安全，防止恶意脚本注入
- 限制扩展可以访问的网络资源
- Manifest v3 强制要求明确声明

### 为什么 file.zhihuishu.com 不在默认列表中？
- 初始版本未考虑所有可能的附件服务器
- 只配置了必要的 API（DeepSeek、OCR）

### 将来如何避免这个问题？
- 需要时可以添加 `*://file.*.com/*` 模式（但这会降低安全性）
- 或者在 `host_permissions` 中已经包含的情况下，只需在 CSP 中对应添加

---

## 📝 日志参考

### 修复前的错误日志
```
CSP Error: Connecting to 'https://file.zhihuishu.com/...' 
violates the following Content Security Policy directive
```

### 修复后预期的正常日志
```
📎 [附件处理] 开始处理: Ex. 7.docx
📎 [URL评分] 候选URL显示
⬇️ [附件下载] 开始下载
   HTTP状态: 200 OK
✅ [附件下载] 成功: 45678 字节
📄 [Docx解析] 找到 150 个 <w:t> 标签
✅ [附件处理] 解析完成
```

---

## 🎯 后续计划

1. **CSP 进一步优化**
   - 考虑支持更多的文件存储服务
   - 评估安全性 vs 功能性的平衡

2. **URL 提取进一步增强**
   - 支持更多平台的URL格式
   - 处理动态生成的下载链接

3. **错误恢复机制**
   - 如果 CSP 仍然阻止，自动降级到手动下载提示
   - 提供更友好的错误信息

---

## 🆘 需要帮助？

如果修复后仍然有问题，请提供：

**必需信息**：
1. 页面 Console 中的完整 URL（📎 [URL1] 地址:）
2. Service Worker 中的完整错误信息

**可选信息**：
3. 截图显示完整日志
4. 浏览器版本（chrome://version）
5. 扩展是否已正确重新加载

基于这些信息，可以进一步诊断问题。
