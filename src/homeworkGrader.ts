/**
 * 作业自动批改主模块
 * Main homework auto-grading module
 */

import { GradingSession, GradingRules, GradingResult } from './types';
import { ContentExtractor } from './contentExtractor';
import { GradingEngine } from './gradingEngine';
import { FeedbackRenderer } from './feedbackRenderer';
import { AIServiceFactory } from './aiService';
import { logger } from './logger';

export class HomeworkGrader {
    private extractor: ContentExtractor;
    private engine: GradingEngine;
    private renderer: FeedbackRenderer;
    private currentSession: GradingSession | null = null;

    constructor(rules?: Partial<GradingRules>) {
        this.extractor = new ContentExtractor();
        this.engine = new GradingEngine(rules);
        this.renderer = new FeedbackRenderer();
        
        logger.info('作业批改系统初始化完成');
    }

    /**
     * 检查当前页面是否为作业页面
     */
    isHomeworkPage(): boolean {
        return this.extractor.isHomeworkPage();
    }

    /**
     * 初始化批改会话
     */
    async initializeSession(): Promise<GradingSession> {
        logger.info('初始化批改会话...');

        const metadata = this.extractor.extractPageMetadata();
        const questions = this.extractor.extractAllQuestions();

        if (questions.length === 0) {
            throw new Error('未找到题目，请确认页面已加载完成');
        }

        this.currentSession = {
            sessionId: `session-${Date.now()}`,
            pageUrl: metadata.url,
            startTime: Date.now(),
            questions,
            results: [],
            totalScore: 0,
            maxTotalScore: questions.reduce((sum, q) => sum + (q.maxScore || 5), 0)
        };

        logger.info('批改会话已创建:', {
            sessionId: this.currentSession.sessionId,
            questionCount: questions.length,
            maxTotalScore: this.currentSession.maxTotalScore
        });

        return this.currentSession;
    }

    /**
     * 批改单个题目
     */
    async gradeQuestion(questionId: string): Promise<GradingResult> {
        if (!this.currentSession) {
            throw new Error('请先初始化批改会话');
        }

        const question = this.currentSession.questions.find(q => q.id === questionId);
        if (!question) {
            throw new Error(`未找到题目: ${questionId}`);
        }

        logger.info(`开始批改题目 ${questionId}`);

        const result = await this.engine.gradeQuestion(question);
        
        // 保存结果
        const existingIndex = this.currentSession.results.findIndex(r => r.questionId === questionId);
        if (existingIndex >= 0) {
            this.currentSession.results[existingIndex] = result;
        } else {
            this.currentSession.results.push(result);
        }

        // 更新总分
        this.updateTotalScore();

        // 渲染反馈
        this.renderer.renderFeedback(result, question);

        logger.info(`题目 ${questionId} 批改完成:`, result);

        return result;
    }

    /**
     * 批改所有题目
     */
    async gradeAllQuestions(onProgress?: (current: number, total: number) => void): Promise<GradingResult[]> {
        if (!this.currentSession) {
            await this.initializeSession();
        }

        if (!this.currentSession) {
            throw new Error('会话初始化失败');
        }

        logger.info(`开始批改所有题目 (共 ${this.currentSession.questions.length} 题)`);

        const questions = this.currentSession.questions;
        const results: GradingResult[] = [];

        for (let i = 0; i < questions.length; i++) {
            try {
                const result = await this.gradeQuestion(questions[i].id);
                results.push(result);

                // 回调进度
                if (onProgress) {
                    onProgress(i + 1, questions.length);
                }

                // 避免过快的请求
                await this.delay(100);
            } catch (error) {
                logger.error(`题目 ${questions[i].id} 批改失败:`, error);
            }
        }

        logger.info('所有题目批改完成');
        this.renderer.showSummary(results);

        return results;
    }

    /**
     * 显示批量操作面板
     */
    showBatchPanel(): void {
        if (!this.currentSession) {
            logger.warn('请先初始化会话');
            return;
        }

        this.renderer.renderBatchPanel(
            this.currentSession.questions.length,
            () => {
                this.gradeAllQuestions((current, total) => {
                    this.renderer.updateBatchProgress(current, total);
                });
            },
            () => {
                logger.info('批量操作面板已关闭');
            }
        );

        logger.info('批量操作面板已显示');
    }

    /**
     * 更新批改规则
     */
    updateRules(rules: Partial<GradingRules>): void {
        this.engine.updateRules(rules);
        logger.info('批改规则已更新');
    }

    /**
     * 获取当前会话
     */
    getCurrentSession(): GradingSession | null {
        return this.currentSession;
    }

    /**
     * 获取批改结果
     */
    getResults(): GradingResult[] {
        return this.currentSession?.results || [];
    }

    /**
     * 导出批改报告
     */
    exportReport(): string {
        if (!this.currentSession) {
            return '无批改数据';
        }

        const session = this.currentSession;
        const results = session.results;

        let report = `智慧树作业批改报告
━━━━━━━━━━━━━━━━━━━━━━━━
会话ID: ${session.sessionId}
页面URL: ${session.pageUrl}
批改时间: ${new Date(session.startTime).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━

题目总数: ${session.questions.length}
已批改: ${results.length}
总分: ${session.totalScore}/${session.maxTotalScore}
通过率: ${this.calculatePassRate()}%

━━━━━━━━━━━━━━━━━━━━━━━━
详细结果:

`;

        results.forEach((result, index) => {
            const question = session.questions.find(q => q.id === result.questionId);
            report += `${index + 1}. ${result.questionId}
   类型: ${this.getTypeLabel(result.type)}
   得分: ${result.score}/${result.maxScore}
   状态: ${result.passed ? '✅ 通过' : '❌ 未通过'}
   反馈: ${result.feedback}
`;

            if (result.suggestions.length > 0) {
                report += `   建议:\n`;
                result.suggestions.forEach(s => {
                    report += `   - ${s}\n`;
                });
            }

            if (question) {
                report += `   题目: ${question.content.substring(0, 100)}...\n`;
            }

            report += '\n';
        });

        report += `━━━━━━━━━━━━━━━━━━━━━━━━
报告生成时间: ${new Date().toLocaleString()}
`;

        return report;
    }

    /**
     * 保存批改报告到文件
     */
    saveReport(): void {
        const report = this.exportReport();
        const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `作业批改报告_${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        logger.info('批改报告已保存');
    }

    /**
     * 更新总分
     */
    private updateTotalScore(): void {
        if (!this.currentSession) return;

        this.currentSession.totalScore = this.currentSession.results.reduce(
            (sum, result) => sum + result.score,
            0
        );
    }

    /**
     * 计算通过率
     */
    private calculatePassRate(): number {
        if (!this.currentSession || this.currentSession.results.length === 0) {
            return 0;
        }

        const passedCount = this.currentSession.results.filter(r => r.passed).length;
        return Math.round((passedCount / this.currentSession.results.length) * 100);
    }

    /**
     * 获取题型标签
     */
    private getTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            'multiple_choice': '选择题',
            'fill_in_blank': '填空题',
            'short_answer': '简答题',
            'unknown': '未知'
        };
        return labels[type] || type;
    }

    /**
     * 延迟函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 启用AI批改（用于简答题）
     */
    async enableAIGrading(apiKey: string): Promise<boolean> {
        try {
            const aiService = AIServiceFactory.getDeepSeekService(apiKey);
            const isAvailable = await aiService.checkAvailability();
            
            if (isAvailable) {
                logger.info('AI批改服务已启用');
                this.updateRules({
                    shortAnswer: {
                        ...this.engine['rules'].shortAnswer,
                        useAI: true
                    }
                });
                return true;
            } else {
                logger.warn('AI服务不可用');
                return false;
            }
        } catch (error) {
            logger.error('启用AI批改失败:', error);
            return false;
        }
    }

    /**
     * 清理会话
     */
    cleanup(): void {
        this.currentSession = null;
        logger.info('批改会话已清理');
    }
}

// 导出全局实例
export const homeworkGrader = new HomeworkGrader();
