/**
 * AI服务模块
 * AI service module for advanced grading
 */

import { AIServiceInterface, AIAnalysisResult, Question } from './types';
import { logger } from './logger';

/**
 * DeepSeek AI服务实现
 */
export class DeepSeekAIService implements AIServiceInterface {
    private apiKey: string;
    private apiUrl: string = 'https://api.deepseek.com/v1/chat/completions';

    constructor(apiKey?: string) {
        this.apiKey = apiKey || '';
    }

    /**
     * 分析简答题
     */
    async analyzeShortAnswer(
        question: string,
        studentAnswer: string,
        standardAnswer?: string
    ): Promise<AIAnalysisResult> {
        logger.info('使用AI分析简答题');

        if (!this.apiKey) {
            throw new Error('AI服务未配置API密钥');
        }

        const prompt = this.buildPrompt(question, studentAnswer, standardAnswer);

        try {
            const response = await this.callAPI(prompt);
            return this.parseResponse(response);
        } catch (error) {
            logger.error('AI服务调用失败:', error);
            throw error;
        }
    }

    /**
     * 批量分析
     */
    async batchAnalyze(questions: Question[]): Promise<AIAnalysisResult[]> {
        logger.info(`批量AI分析 ${questions.length} 个题目`);

        const results: AIAnalysisResult[] = [];

        for (const question of questions) {
            try {
                const result = await this.analyzeShortAnswer(
                    question.content,
                    question.studentAnswer,
                    question.standardAnswer
                );
                results.push(result);
            } catch (error) {
                logger.error(`题目 ${question.id} AI分析失败:`, error);
                results.push(this.createFallbackResult());
            }
        }

        return results;
    }

    /**
     * 构建AI提示词
     */
    private buildPrompt(question: string, studentAnswer: string, standardAnswer?: string): string {
        let prompt = `请作为专业教师评判以下简答题：

【题目】
${question}

【学生答案】
${studentAnswer}
`;

        if (standardAnswer) {
            prompt += `
【参考答案】
${standardAnswer}
`;
        }

        prompt += `
请按以下格式提供评分和反馈：
1. 评分（满分10分）：[具体分数]
2. 反馈：[简要评价]
3. 建议：[改进建议，用分号分隔]

要求：
- 评分要客观公正
- 反馈简洁明了
- 建议具有可操作性
`;

        return prompt;
    }

    /**
     * 调用AI API
     */
    private async callAPI(prompt: string): Promise<string> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一位经验丰富的教师，擅长批改学生作业。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error(`AI API调用失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * 解析AI响应
     */
    private parseResponse(response: string): AIAnalysisResult {
        logger.debug('解析AI响应:', response);

        // 提取评分
        const scoreMatch = response.match(/评分[：:]\s*(\d+(?:\.\d+)?)/);
        const score = scoreMatch ? parseFloat(scoreMatch[1]) : 5;

        // 提取反馈
        const feedbackMatch = response.match(/反馈[：:]\s*(.+?)(?:\n|$)/);
        const feedback = feedbackMatch ? feedbackMatch[1].trim() : '回答基本符合要求';

        // 提取建议
        const suggestionsMatch = response.match(/建议[：:]\s*(.+?)(?:\n\n|$)/s);
        const suggestionsText = suggestionsMatch ? suggestionsMatch[1].trim() : '';
        const suggestions = suggestionsText
            .split(/[;；\n]/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        return {
            score: Math.min(Math.max(score, 0), 10),
            maxScore: 10,
            feedback,
            suggestions: suggestions.length > 0 ? suggestions : ['继续加油'],
            confidence: 0.8
        };
    }

    /**
     * 创建降级结果（当AI不可用时）
     */
    private createFallbackResult(): AIAnalysisResult {
        return {
            score: 5,
            maxScore: 10,
            feedback: 'AI服务暂时不可用，使用规则引擎评分',
            suggestions: ['请稍后重试使用AI评分'],
            confidence: 0.3
        };
    }

    /**
     * 设置API密钥
     */
    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        logger.info('AI服务API密钥已更新');
    }

    /**
     * 检查服务是否可用
     */
    async checkAvailability(): Promise<boolean> {
        if (!this.apiKey) {
            logger.warn('AI服务未配置API密钥');
            return false;
        }

        try {
            await this.callAPI('测试连接');
            logger.info('AI服务可用');
            return true;
        } catch (error) {
            logger.error('AI服务不可用:', error);
            return false;
        }
    }
}

/**
 * 规则引擎服务（本地评分，不依赖AI）
 */
export class RuleEngineService implements AIServiceInterface {
    async analyzeShortAnswer(
        _question: string,
        studentAnswer: string,
        standardAnswer?: string
    ): Promise<AIAnalysisResult> {
        logger.info('使用规则引擎分析简答题');

        const wordCount = this.countWords(studentAnswer);
        let score = 5; // 基础分
        const suggestions: string[] = [];

        // 字数评分
        if (wordCount < 10) {
            score -= 2;
            suggestions.push('答案字数较少，建议补充更多内容');
        } else if (wordCount > 200) {
            score -= 1;
            suggestions.push('答案较长，建议精简表述');
        }

        // 关键词匹配
        if (standardAnswer) {
            const keywords = this.extractKeywords(standardAnswer);
            const matchedKeywords = keywords.filter(kw => studentAnswer.includes(kw));
            
            if (matchedKeywords.length > 0) {
                score += Math.min(matchedKeywords.length, 3);
                suggestions.push(`答案包含${matchedKeywords.length}个关键要点`);
            } else {
                score -= 1;
                suggestions.push('答案缺少关键要点，请参考标准答案');
            }
        }

        score = Math.max(0, Math.min(score, 10));

        return {
            score,
            maxScore: 10,
            feedback: score >= 6 ? '回答基本符合要求' : '回答需要改进',
            suggestions: suggestions.length > 0 ? suggestions : ['回答还可以，继续努力'],
            confidence: 0.6
        };
    }

    async batchAnalyze(questions: Question[]): Promise<AIAnalysisResult[]> {
        const results: AIAnalysisResult[] = [];

        for (const question of questions) {
            const result = await this.analyzeShortAnswer(
                question.content,
                question.studentAnswer,
                question.standardAnswer
            );
            results.push(result);
        }

        return results;
    }

    private countWords(text: string): number {
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
        const englishWords = text.match(/[a-zA-Z]+/g) || [];
        return chineseChars.length + englishWords.length;
    }

    private extractKeywords(text: string): string[] {
        const words = text
            .replace(/[，。！？、；：""''（）《》【】\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length >= 2);
        return [...new Set(words)];
    }
}

/**
 * AI服务工厂
 */
export class AIServiceFactory {
    private static deepseekService: DeepSeekAIService | null = null;
    private static ruleEngineService: RuleEngineService | null = null;

    /**
     * 获取DeepSeek AI服务
     */
    static getDeepSeekService(apiKey?: string): DeepSeekAIService {
        if (!this.deepseekService) {
            this.deepseekService = new DeepSeekAIService(apiKey);
        } else if (apiKey) {
            this.deepseekService.setApiKey(apiKey);
        }
        return this.deepseekService;
    }

    /**
     * 获取规则引擎服务
     */
    static getRuleEngineService(): RuleEngineService {
        if (!this.ruleEngineService) {
            this.ruleEngineService = new RuleEngineService();
        }
        return this.ruleEngineService;
    }

    /**
     * 根据配置获取合适的服务
     */
    static async getService(useAI: boolean = false, apiKey?: string): Promise<AIServiceInterface> {
        if (useAI && apiKey) {
            const aiService = this.getDeepSeekService(apiKey);
            const isAvailable = await aiService.checkAvailability();
            
            if (isAvailable) {
                logger.info('使用DeepSeek AI服务');
                return aiService;
            } else {
                logger.warn('AI服务不可用，降级为规则引擎');
            }
        }

        logger.info('使用规则引擎服务');
        return this.getRuleEngineService();
    }
}
