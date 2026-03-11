# 🎨 分析结果 UI 集成指南

本文档提供分析结果与 UI 集成的建议方案。

## 架构概览

```
数据流向：
content.js (main)
    ↓
[window._zhsPreviewFileResults[]]
    ↓
popup.js / AI助手模块
    ↓
UI 展示分析结果
```

## 方案 1: 在 Popup 中展示分析结果

### 实现位置

**File**: `src/popup/popup.html`

1. 添加新标签页（如"文件分析"标签）
2. 在标签页中显示分析结果表格

### 示例 HTML

```html
<!-- popup.html -->
<div class="tab-panel" data-panel="analysis">
    <div class="analysis-container">
        <h3>📊 已分析的文件</h3>
        
        <!-- 文件列表 -->
        <div id="analysis-list" class="analysis-list">
            <!-- 动态填充 -->
        </div>
        
        <!-- 分析详情 -->
        <div id="analysis-detail" class="analysis-detail" style="display: none;">
            <h4 id="detail-title"></h4>
            
            <div class="analysis-section">
                <h5>题目 (<span id="question-count">0</span>)</h5>
                <div id="questions-container" class="content-list">
                    <!-- 题目列表 -->
                </div>
            </div>
            
            <div class="analysis-section">
                <h5>答案 (<span id="answer-count">0</span>)</h5>
                <div id="answers-container" class="content-list">
                    <!-- 答案列表 -->
                </div>
            </div>
            
            <div class="analysis-section">
                <h5>关键点</h5>
                <div id="keypoints-container" class="content-list">
                    <!-- 关键点列表 -->
                </div>
            </div>
        </div>
    </div>
</div>
```

### 示例 JavaScript

**File**: `src/popup/popup.js`

```javascript
// 在 DOMContentLoaded 中添加

// ========== 分析结果 UI 管理 ==========
class AnalysisUI {
    constructor() {
        this.analysisContainer = document.getElementById('analysis-list');
        this.detailContainer = document.getElementById('analysis-detail');
    }
    
    // 获取主页面的分析缓存
    async getAnalysisData() {
        return new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'getAnalysisResults'
                }, (response) => {
                    resolve(response?.results || []);
                });
            });
        });
    }
    
    // 渲染文件列表
    async renderFileList() {
        const results = await this.getAnalysisData();
        
        if (results.length === 0) {
            this.analysisContainer.innerHTML = '<p class="empty-tip">暂无分析结果</p>';
            return;
        }
        
        const html = results.map((file, idx) => `
            <div class="analysis-file-item" data-index="${idx}">
                <div class="file-header">
                    <span class="file-name">📄 ${file.fileName}</span>
                    <span class="file-stats">
                        ${file.analysis?.questions?.length || 0} 题 | 
                        ${file.analysis?.answers?.length || 0} 答
                    </span>
                </div>
                <div class="file-preview">
                    ${file.analysis?.title ? `<p><strong>标题:</strong> ${file.analysis.title}</p>` : ''}
                    ${file.analysis?.questions?.[0] ? `<p><strong>第1题:</strong> ${file.analysis.questions[0].substring(0, 60)}...</p>` : ''}
                </div>
                <button class="view-detail-btn" data-index="${idx}">查看详情</button>
            </div>
        `).join('');
        
        this.analysisContainer.innerHTML = html;
        
        // 绑定点击事件
        document.querySelectorAll('.view-detail-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showDetail(parseInt(btn.dataset.index), results);
            });
        });
    }
    
    // 展示详情
    showDetail(idx, results) {
        const file = results[idx];
        if (!file?.analysis) return;
        
        const analysis = file.analysis;
        
        // 设置标题
        document.getElementById('detail-title').textContent = 
            analysis.title || file.fileName;
        
        // 填充题目
        document.getElementById('question-count').textContent = 
            analysis.questions?.length || 0;
        document.getElementById('questions-container').innerHTML = 
            (analysis.questions || []).map((q, i) => `
                <div class="content-item question">
                    <span class="item-number">${i + 1}</span>
                    <span class="item-content">${q}</span>
                </div>
            `).join('');
        
        // 填充答案
        document.getElementById('answer-count').textContent = 
            analysis.answers?.length || 0;
        document.getElementById('answers-container').innerHTML = 
            (analysis.answers || []).map((a, i) => `
                <div class="content-item answer">
                    <span class="item-number">${i + 1}</span>
                    <span class="item-content">${a}</span>
                </div>
            `).join('');
        
        // 填充关键点
        document.getElementById('keypoints-container').innerHTML = 
            (analysis.keyPoints || []).map((p, i) => `
                <div class="content-item keypoint">
                    <span class="item-number">•</span>
                    <span class="item-content">${p}</span>
                </div>
            `).join('');
        
        // 显示详情面板
        this.detailContainer.style.display = 'block';
    }
}

// 初始化
const analysisUI = new AnalysisUI();

// 在标签页激活时更新
tabButtons.forEach(btn => {
    if (btn.dataset.tab === 'analysis') {
        btn.addEventListener('click', () => {
            analysisUI.renderFileList();
        });
    }
});
```

### 在 content.js 中添加消息处理

```javascript
// 在 content.js 中添加
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getAnalysisResults') {
        sendResponse({
            results: window._zhsPreviewFileResults || []
        });
        return true;
    }
});
```

## 方案 2: 集成到 AI 助手

### 概念

当用户要求 AI 分析某个文件时，自动使用已有的分析结果。

### 实现思路

```javascript
// 在 AI 助手初始化时
class AssistantWithAnalysis {
    async analyzeDocument(fileName) {
        // 1. 从缓存中查找分析结果
        const analysis = window._zhsPreviewFileResults.find(f => 
            f.fileName.includes(fileName) || fileName.includes(f.fileName)
        )?.analysis;
        
        if (!analysis) {
            return "未找到文件分析结果";
        }
        
        // 2. 构建 AI 提示词
        const prompt = this.buildPrompt(analysis);
        
        // 3. 发送给 AI
        return await this.sendToAI(prompt);
    }
    
    buildPrompt(analysis) {
        return `
文件分析结果：
- 标题: ${analysis.title || '(无)'}
- 题目数: ${analysis.questions?.length || 0}
- 答案数: ${analysis.answers?.length || 0}

识别到的题目：
${(analysis.questions || []).map((q, i) => `${i+1}. ${q}`).join('\n')}

识别到的答案：
${(analysis.answers || []).map((a, i) => `${i+1}. ${a}`).join('\n')}

请基于以上内容分析...
        `;
    }
}
```

## 方案 3: 导出功能

### 导出为 JSON

```javascript
function exportAnalysisAsJSON(fileIndex) {
    const file = window._zhsPreviewFileResults[fileIndex];
    const json = JSON.stringify(file.analysis, null, 2);
    
    // 触发下载
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.fileName}_analysis.json`;
    a.click();
}
```

### 导出为 CSV

```javascript
function exportAnalysisAsCSV(fileIndex) {
    const file = window._zhsPreviewFileResults[fileIndex];
    const analysis = file.analysis;
    
    let csv = '题目\t答案\n';
    const maxLen = Math.max(
        analysis.questions?.length || 0,
        analysis.answers?.length || 0
    );
    
    for (let i = 0; i < maxLen; i++) {
        const q = (analysis.questions?.[i] || '').replace(/\t/g, ' ');
        const a = (analysis.answers?.[i] || '').replace(/\t/g, ' ');
        csv += `${q}\t${a}\n`;
    }
    
    // 触发下载
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.fileName}_analysis.csv`;
    a.click();
}
```

## 示例 CSS

```css
/* popup.css 中添加 */

.analysis-container {
    padding: 10px;
}

.analysis-list {
    margin-bottom: 20px;
}

.analysis-file-item {
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    padding: 10px;
    margin-bottom: 10px;
    background: #f9f9f9;
}

.file-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.file-name {
    font-weight: bold;
    color: #333;
}

.file-stats {
    font-size: 12px;
    color: #666;
}

.file-preview {
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
}

.file-preview p {
    margin: 4px 0;
}

.view-detail-btn {
    background: #2196F3;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
}

.view-detail-btn:hover {
    background: #1976D2;
}

.analysis-detail {
    border-top: 1px solid #e0e0e0;
    padding-top: 15px;
}

.analysis-section {
    margin-bottom: 15px;
}

.analysis-section h5 {
    margin: 10px 0 5px 0;
    color: #333;
    font-size: 13px;
}

.content-list {
    background: #f5f5f5;
    border-radius: 3px;
    padding: 8px;
    max-height: 200px;
    overflow-y: auto;
}

.content-item {
    padding: 5px;
    margin: 4px 0;
    border-left: 3px solid #2196F3;
    padding-left: 8px;
    font-size: 12px;
}

.content-item.answer {
    border-left-color: #4CAF50;
}

.content-item.keypoint {
    border-left-color: #FF9800;
}

.item-number {
    font-weight: bold;
    color: #666;
    margin-right: 5px;
}

.item-content {
    color: #333;
}

.empty-tip {
    text-align: center;
    color: #999;
    padding: 20px;
}
```

## 测试流程

1. **打开智慧树作业页面**
2. **点击附件** → 自动分析
3. **打开 Popup** → 查看分析结果
4. **导出数据** (可选)

## 将来扩展

- [ ] 搜索和过滤功能
- [ ] 标签管理（标记重要题目）
- [ ] 统计分析（题型分布、难度等级）
- [ ] 导出到云端
- [ ] AI 自动出题
