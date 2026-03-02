# 故障排查

## 1. 看不到按钮或浮窗

### 现象

- 学生列表页没有红色“启动自动批改”按钮
- 其他页面没有右下角浮窗球

### 解决

1. 进入 chrome://extensions/
2. 找到扩展并点击刷新
3. 回到知慧树页面按 Ctrl + Shift + R 强制刷新
4. 仍无效时，参考 [USER_GUIDE.md](USER_GUIDE.md) 的安装流程重新加载插件

## 2. Service Worker 连接失败

### 现象描述

- 控制台提示 “Could not establish connection”

### 评分填充问题解决步骤

1. 打开 chrome://extensions/
2. 点击扩展卡片上的 Service Worker 链接
3. 检查日志是否有语法错误或初始化失败
4. 重新加载扩展并刷新页面

## 3. 自动批改卡住或中断

### 可能原因

- 页面加载缓慢
- 页面结构变化导致选择器找不到
- AI 接口超时

### 作业分析失败解决步骤

1. 打开控制台 F12 查看日志
2. 刷新页面后重试
3. 适当增加等待时间后重试，并确认网络稳定

## 4. 评分或评语没有填充

### 卡住中断问题解决步骤

1. 确认页面有评分与评语输入框
2. 查看控制台是否有“未找到输入框”的日志
3. 反馈页面结构变化，提供 HTML 片段

## 5. 作业详情 AI 分析失败

### 解决步骤

1. 检查网络是否能访问 [https://api.deepseek.com](https://api.deepseek.com)
2. 确认 API Key 已配置
3. 等待 30 秒后重试
4. 若频繁超时，降低同时操作量或更换网络

## 6. 快速自检

在控制台执行：

```javascript
// 浮窗球
console.log(document.getElementById('zhihuishu-ai-floating-ball'));

// 自动批改按钮
console.log(document.getElementById('zh-auto-grading-btn'));

// 学生列表行数
console.log(document.querySelectorAll('tbody tr.el-table__row').length);
```

如果返回 null，请按本页第 1 节检查扩展是否正确加载。
