# 🔧 扩展通信问题调试指南

## 问题症状
- 点击悬浮球后，显示"消息超时"错误
- 控制台显示 `❌ [诊断] Ping尝试失败: 消息超时`
- 所有 background 通信失败

## 调试步骤

### 1️⃣ 检查 Service Worker 状态

1. 打开 Chrome 扩展管理页面：
   ```
   chrome://extensions/
   ```

2. 确保"开发者模式"已启用（右上角开关）

3. 找到"智慧树 AI 助教"扩展，检查：
   - ✅ 扩展是否已启用（蓝色开关）
   - ❌ 是否有错误提示（红色感叹号）

4. 查看 Service Worker 状态：
   - 在扩展卡片中查找 **"service worker"** 链接
   - 如果显示 **"service worker (inactive)"**，说明 Service Worker 已休眠
   - 点击链接打开 DevTools

5. 查看 Service Worker 日志：
   - 应该看到：
     ```
     🚀 [Background] Service Worker 正在启动...
     ✅ [Background] 早期 Ping 监听器已注册
     💓 [Background] Service Worker 保活机制已启动
     ```
   - 如果没有日志，说明 Service Worker 未加载

### 2️⃣ 使用诊断工具

1. 在智慧树作业页面按 `F12` 打开控制台

2. 复制 `DEBUG_TOOL.js` 文件的全部内容

3. 粘贴到控制台并按回车运行

4. 查看诊断结果：
   - ✅ 如果显示"诊断完成：通信正常"，问题已解决
   - ❌ 如果显示"诊断完成：通信失败"，继续下一步

### 3️⃣ 强制重新加载扩展

1. 在 `chrome://extensions/` 页面

2. 找到"智慧树 AI 助教"扩展

3. 点击 **刷新按钮 🔄**

4. 等待 3 秒

5. 点击 **"service worker"** 链接，确认看到启动日志

6. 切回智慧树页面，按 `F5` 刷新

7. 再次测试功能

### 4️⃣ 检查浏览器版本

确保使用的是最新版 Chrome：
```
chrome://settings/help
```
要求：Chrome 93 或更高版本

### 5️⃣ 检查 manifest.json 配置

确认 `manifest.json` 中的配置正确：

```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "src/background/background.js"
  },
  "permissions": [
    "activeTab",
    "tabs",
    "scripting",
    "storage"
  ]
}
```

### 6️⃣ 查看详细错误信息

在智慧树页面控制台(F12)中，刷新页面后点击浮窗球，查找以下日志：

```
🔍 [诊断] 开始运行时环境检查...
  chrome.runtime 存在: true
  chrome.runtime.id: <扩展ID>
  扩展上下文有效: true
```

如果看到 `扩展上下文有效: false`，说明扩展未正确加载。

### 7️⃣ 清除扩展数据重试

1. 在 `chrome://extensions/` 页面
2. 找到扩展，点击"删除"
3. 重新加载扩展文件夹
4. 刷新智慧树页面
5. 测试功能

## 常见错误及解决方案

### ❌ "Receiving end does not exist"
**原因**: Service Worker 未启动或已崩溃
**解决**: 
1. 刷新扩展 (chrome://extensions/)
2. 检查 background.js 是否有语法错误
3. 查看 Service Worker DevTools 中的错误

### ❌ "Extension context invalidated"
**原因**: 扩展在运行中被重新加载
**解决**: 刷新当前页面 (F5)

### ❌ "消息超时（10秒）"
**原因**: Service Worker 休眠或无响应
**解决**: 
1. 检查保活机制是否启动（查看 background 日志）
2. 确认早期 Ping 监听器已注册
3. 强制重新加载扩展

### ❌ 控制台没有任何日志
**原因**: Content script 未注入
**解决**: 
1. 检查 URL 是否匹配 manifest.json 中的 `matches` 规则
2. 刷新页面
3. 检查是否有其他扩展冲突

## 技术细节

### Service Worker 生命周期

Chrome 会在以下情况终止 Service Worker：
- 30 秒无活动
- 内存压力
- 扩展更新

本扩展使用 20 秒间隔的保活机制来防止休眠。

### 消息监听器注册顺序

必须在 background.js 开头立即注册消息监听器：

```javascript
// ✅ 正确：在所有代码之前
chrome.runtime.onMessage.addListener(...);

// ❌ 错误：在其他初始化代码之后
async function init() { ... }
chrome.runtime.onMessage.addListener(...);
```

### Ping 超时时间

- 首次尝试：10 秒（给 Service Worker 充分的唤醒时间）
- 后续重试：5 秒
- 最多重试 3 次

## 联系支持

如果以上步骤都无法解决问题，请提供：
1. Service Worker DevTools 的截图（包含完整日志）
2. Chrome 版本号
3. 诊断工具的输出结果
4. 页面控制台的完整错误信息
