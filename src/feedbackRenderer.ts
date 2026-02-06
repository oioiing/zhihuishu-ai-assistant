/**
 * 反馈渲染模块
 * Feedback rendering module for displaying grading results
 */

import { GradingResult, Question, QuestionType } from './types';
import { logger } from './logger';

export class FeedbackRenderer {
    private styleInjected: boolean = false;

    constructor() {
        this.injectStyles();
    }

    /**
     * 注入样式
     */
    private injectStyles(): void {
        if (this.styleInjected) return;

        const style = document.createElement('style');
        style.id = 'zhihuishu-grading-feedback-styles';
        style.textContent = `
            /* 批改反馈卡片样式 */
            .zhs-feedback-card {
                margin: 10px 0;
                padding: 15px;
                border-radius: 8px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                animation: fadeIn 0.3s ease-in;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .zhs-feedback-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(255,255,255,0.3);
            }

            .zhs-feedback-title {
                font-size: 16px;
                font-weight: 600;
            }

            .zhs-feedback-score {
                font-size: 24px;
                font-weight: bold;
            }

            .zhs-feedback-body {
                margin: 12px 0;
            }

            .zhs-feedback-text {
                font-size: 14px;
                line-height: 1.6;
                margin: 8px 0;
            }

            .zhs-feedback-suggestions {
                margin-top: 12px;
            }

            .zhs-suggestion-item {
                display: flex;
                align-items: flex-start;
                margin: 6px 0;
                font-size: 13px;
                line-height: 1.5;
            }

            .zhs-suggestion-item::before {
                content: '💡';
                margin-right: 6px;
                flex-shrink: 0;
            }

            .zhs-feedback-details {
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid rgba(255,255,255,0.3);
                font-size: 12px;
                opacity: 0.9;
            }

            .zhs-feedback-passed {
                background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            }

            .zhs-feedback-failed {
                background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
            }

            .zhs-feedback-partial {
                background: linear-gradient(135deg, #f2994a 0%, #f2c94c 100%);
            }

            /* 批量操作面板 */
            .zhs-batch-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: white;
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                z-index: 10000;
                min-width: 300px;
                animation: slideUp 0.3s ease-out;
            }

            @keyframes slideUp {
                from { transform: translateY(100px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            .zhs-batch-header {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 15px;
                color: #333;
            }

            .zhs-batch-stats {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
                margin-bottom: 15px;
            }

            .zhs-stat-item {
                padding: 10px;
                border-radius: 6px;
                background: #f5f5f5;
                text-align: center;
            }

            .zhs-stat-label {
                font-size: 12px;
                color: #666;
                margin-bottom: 4px;
            }

            .zhs-stat-value {
                font-size: 20px;
                font-weight: bold;
                color: #333;
            }

            .zhs-batch-button {
                width: 100%;
                padding: 12px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                margin-top: 10px;
            }

            .zhs-batch-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }

            .zhs-batch-button-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }

            .zhs-batch-button-success {
                background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                color: white;
            }

            .zhs-batch-button-close {
                background: #f5f5f5;
                color: #666;
            }

            .zhs-progress-bar {
                width: 100%;
                height: 6px;
                background: #e0e0e0;
                border-radius: 3px;
                overflow: hidden;
                margin: 10px 0;
            }

            .zhs-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                transition: width 0.3s ease;
            }
        `;

        document.head.appendChild(style);
        this.styleInjected = true;
        logger.debug('反馈样式已注入');
    }

    /**
     * 渲染单个题目的反馈
     */
    renderFeedback(result: GradingResult, question: Question): void {
        logger.debug(`渲染题目 ${result.questionId} 的反馈`);

        // 移除旧的反馈卡片
        const oldCard = question.element.querySelector('.zhs-feedback-card');
        if (oldCard) {
            oldCard.remove();
        }

        // 创建反馈卡片
        const card = document.createElement('div');
        card.className = this.getFeedbackClass(result);
        card.innerHTML = this.generateFeedbackHTML(result);

        // 插入到题目元素后面
        question.element.appendChild(card);

        logger.info(`题目 ${result.questionId} 反馈已渲染`);
    }

    /**
     * 批量渲染反馈
     */
    batchRenderFeedback(results: GradingResult[], questions: Question[]): void {
        logger.info(`批量渲染 ${results.length} 个反馈`);

        const questionMap = new Map(questions.map(q => [q.id, q]));

        results.forEach(result => {
            const question = questionMap.get(result.questionId);
            if (question) {
                this.renderFeedback(result, question);
            }
        });
    }

    /**
     * 获取反馈卡片的CSS类
     */
    private getFeedbackClass(result: GradingResult): string {
        const baseClass = 'zhs-feedback-card';
        
        if (result.passed) {
            return `${baseClass} zhs-feedback-passed`;
        } else if (result.score > 0) {
            return `${baseClass} zhs-feedback-partial`;
        } else {
            return `${baseClass} zhs-feedback-failed`;
        }
    }

    /**
     * 生成反馈HTML
     */
    private generateFeedbackHTML(result: GradingResult): string {
        const typeLabel = this.getTypeLabel(result.type);
        const percentage = result.maxScore > 0 
            ? Math.round((result.score / result.maxScore) * 100) 
            : 0;

        let html = `
            <div class="zhs-feedback-header">
                <div class="zhs-feedback-title">${typeLabel} 批改结果</div>
                <div class="zhs-feedback-score">${result.score}/${result.maxScore} (${percentage}%)</div>
            </div>
            <div class="zhs-feedback-body">
                <div class="zhs-feedback-text">${result.feedback}</div>
        `;

        // 添加建议
        if (result.suggestions && result.suggestions.length > 0) {
            html += '<div class="zhs-feedback-suggestions">';
            result.suggestions.forEach(suggestion => {
                html += `<div class="zhs-suggestion-item">${suggestion}</div>`;
            });
            html += '</div>';
        }

        // 添加详细信息
        if (result.details) {
            html += '<div class="zhs-feedback-details">';
            
            if (result.details.correctAnswer) {
                html += `<div>✓ 正确答案: ${result.details.correctAnswer}</div>`;
            }
            
            if (result.details.similarity !== undefined) {
                const simPercent = Math.round(result.details.similarity * 100);
                html += `<div>📊 相似度: ${simPercent}%</div>`;
            }
            
            if (result.details.wordCount !== undefined) {
                html += `<div>📝 字数: ${result.details.wordCount}</div>`;
            }
            
            if (result.details.keywordsFound && result.details.keywordsFound.length > 0) {
                html += `<div>🔑 关键词: ${result.details.keywordsFound.join(', ')}</div>`;
            }
            
            html += '</div>';
        }

        html += '</div>';

        return html;
    }

    /**
     * 获取题型标签
     */
    private getTypeLabel(type: QuestionType): string {
        const labels = {
            [QuestionType.MULTIPLE_CHOICE]: '选择题',
            [QuestionType.FILL_IN_BLANK]: '填空题',
            [QuestionType.SHORT_ANSWER]: '简答题',
            [QuestionType.UNKNOWN]: '未知题型'
        };
        return labels[type] || '题目';
    }

    /**
     * 渲染批量操作面板
     */
    renderBatchPanel(
        totalQuestions: number,
        onGradeAll: () => void,
        onClose: () => void
    ): HTMLElement {
        logger.debug('渲染批量操作面板');

        // 移除旧面板
        const oldPanel = document.querySelector('.zhs-batch-panel');
        if (oldPanel) {
            oldPanel.remove();
        }

        const panel = document.createElement('div');
        panel.className = 'zhs-batch-panel';
        panel.innerHTML = `
            <div class="zhs-batch-header">📊 批改助手</div>
            <div class="zhs-batch-stats">
                <div class="zhs-stat-item">
                    <div class="zhs-stat-label">总题数</div>
                    <div class="zhs-stat-value">${totalQuestions}</div>
                </div>
                <div class="zhs-stat-item">
                    <div class="zhs-stat-label">已批改</div>
                    <div class="zhs-stat-value" id="zhs-graded-count">0</div>
                </div>
            </div>
            <div class="zhs-progress-bar">
                <div class="zhs-progress-fill" id="zhs-progress-fill" style="width: 0%"></div>
            </div>
            <button class="zhs-batch-button zhs-batch-button-primary" id="zhs-grade-all-btn">
                🚀 一键批改所有题目
            </button>
            <button class="zhs-batch-button zhs-batch-button-close" id="zhs-close-panel-btn">
                ✕ 关闭
            </button>
        `;

        document.body.appendChild(panel);

        // 绑定事件
        const gradeAllBtn = panel.querySelector('#zhs-grade-all-btn') as HTMLButtonElement;
        const closeBtn = panel.querySelector('#zhs-close-panel-btn') as HTMLButtonElement;

        gradeAllBtn.addEventListener('click', () => {
            gradeAllBtn.disabled = true;
            gradeAllBtn.textContent = '⏳ 批改中...';
            onGradeAll();
        });

        closeBtn.addEventListener('click', () => {
            panel.remove();
            onClose();
        });

        return panel;
    }

    /**
     * 更新批量操作面板进度
     */
    updateBatchProgress(gradedCount: number, totalCount: number): void {
        const countEl = document.querySelector('#zhs-graded-count');
        const fillEl = document.querySelector('#zhs-progress-fill') as HTMLElement;
        const btnEl = document.querySelector('#zhs-grade-all-btn') as HTMLButtonElement;

        if (countEl) {
            countEl.textContent = gradedCount.toString();
        }

        if (fillEl) {
            const percentage = (gradedCount / totalCount) * 100;
            fillEl.style.width = `${percentage}%`;
        }

        if (btnEl && gradedCount === totalCount) {
            btnEl.className = 'zhs-batch-button zhs-batch-button-success';
            btnEl.textContent = '✅ 批改完成';
            btnEl.disabled = true;
        }
    }

    /**
     * 显示总结面板
     */
    showSummary(results: GradingResult[]): void {
        const totalScore = results.reduce((sum, r) => sum + r.score, 0);
        const maxTotalScore = results.reduce((sum, r) => sum + r.maxScore, 0);
        const passedCount = results.filter(r => r.passed).length;
        const percentage = maxTotalScore > 0 
            ? Math.round((totalScore / maxTotalScore) * 100) 
            : 0;

        const summary = `
批改完成！
━━━━━━━━━━━━━━━━
📊 总分: ${totalScore}/${maxTotalScore} (${percentage}%)
✅ 通过: ${passedCount}/${results.length} 题
━━━━━━━━━━━━━━━━
        `.trim();

        alert(summary);
        logger.info('批改总结:', summary);
    }
}
