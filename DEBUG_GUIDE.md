# 🚨 重要提示：如何正确运行诊断工具

## 问题症状
如果您看到：`chrome.runtime: ❌ 不存在`，说明您在**错误的位置**打开了控制台！

## ✅ 正确的操作步骤

### 方法 1：从页面主区域打开控制台（推荐）

1. **在智慧树作业页面的空白处**（不要在 iframe 里）右键点击
2. 选择"**检查**"（Inspect）或按 **F12**
3. 切换到 **Console（控制台）** 标签
4. 复制 `DEBUG_TOOL.js` 的全部内容并粘贴到控制台
5. 按 **Enter** 运行

### 方法 2：确认当前上下文

打开控制台后，先运行这个命令检查：

```javascript
console.log('在 iframe 中:', window.self !== window.top);
console.log('URL:', window.location.href);
console.log('chrome.runtime 存在:', typeof chrome?.runtime !== 'undefined');
```

**期望的输出：**
- `在 iframe 中: false` ✅
- `URL: https://hike-teaching-center.polymas.com/...` 或 `https://...zhihuishu.com/...` ✅
- `chrome.runtime 存在: true` ✅

如果看到 `在 iframe 中: true` ❌，说明您在 iframe 中打开了控制台！

### 方法 3：切换控制台上下文

如果不小心在 iframe 中打开了控制台：

1. 查看控制台**顶部状态栏**
2. 找到上下文选择器（通常显示当前页面 URL）
3. 点击下拉菜单，选择 **"top"** 或主页面的 URL
4. 重新运行诊断工具

示例：
```
[top] ▼  <-- 点击这里切换
├─ top (主框架) ✅ 选这个
├─ iframe #1
└─ iframe #2
```

## ❌ 常见错误

### 错误 1：在 iframe 的控制台中运行
**症状：** `chrome.runtime: ❌ 不存在`  
**原因：** content script 配置了 `all_frames: false`，只在主框架注入  
**解决：** 按上面的方法切换到主框架

### 错误 2：在错误的页面运行
**症状：** `chrome.runtime: ❌ 不存在`  
**原因：** 当前页面 URL 不匹配扩展规则  
**解决：** 确保在以下域名的页面运行：
- `https://zhihuishu.com/*`
- `https://www.zhihuishu.com/*`
- `https://*.zhihuishu.com/*`
- `https://hike-teaching-center.polymas.com/*`
- `https://*.polymas.com/*`

### 错误 3：页面未完全加载
**症状：** 扩展图标或悬浮球未出现  
**解决：** 等待页面完全加载，或按 F5 刷新

## 🎯 验证成功

如果诊断工具正常运行，您应该看到：

```
🔍 ========== 扩展诊断工具开始 ==========

📋 步骤 0: 检查运行环境
  当前 URL: https://hike-teaching-center.polymas.com/...
  是否在 iframe 中: ✅ 否（正确）
  页面标题: ...
  URL 匹配扩展规则: ✅ 匹配

📋 步骤 1: 检查 Chrome 扩展 API
  chrome 对象: ✅ 存在
  chrome.runtime: ✅ 存在

📋 步骤 2: 检查扩展上下文
  扩展 ID: abcd1234...

📋 步骤 3: 获取扩展信息
  扩展名称: 智慧树 AI 助教
  扩展版本: 1.0.0
  ...
```

## 🆘 仍然无法解决？

如果按照上述步骤操作后仍然失败：

1. **检查扩展状态**
   - 打开 `chrome://extensions/`
   - 确认"智慧树 AI 助教"已启用
   - 点击刷新按钮 🔄
   - 检查是否有错误提示

2. **查看 Service Worker 日志**
   - 在扩展卡片中点击 "service worker" 链接
   - 应该看到启动日志

3. **完全重新加载**
   - 刷新扩展（chrome://extensions/）
   - 关闭并重新打开智慧树页面
   - 重新运行诊断工具

4. **提供详细信息**
   - 截图控制台的完整输出
   - 提供当前页面的 URL
   - 提供 Service Worker 的日志截图
