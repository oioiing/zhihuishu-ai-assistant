/**
 * 批改引擎模块
 * Grading engine module
 */

import { Question, QuestionType, GradingRules, GradingResult } from './types';
import { logger } from './logger';

export class GradingEngine {
    private rules: GradingRules;

    constructor(rules?: Partial<GradingRules>) {
        this.rules = this.getDefaultRules();
        if (rules) {
            this.updateRules(rules);
        }
    }

    /**
     * 获取默认批改规则
     */
    private getDefaultRules(): GradingRules {
        return {
            multipleChoice: {
                caseSensitive: false,
                trimWhitespace: true
            },
            fillInBlank: {
                fuzzyMatch: true,
                ignoreCase: true,
                trimWhitespace: true,
                synonyms: {
                    '是': ['对', 'yes', '正确'],
                    '否': ['错', 'no', '不对'],
                    '正确': ['对', '是', 'yes'],
                    '错误': ['错', '否', 'no']
                },
                similarityThreshold: 0.8
            },
            shortAnswer: {
                keywordMatching: true,
                keywords: [],
                minWordCount: 10,
                maxWordCount: 1000,
                useAI: false
            }
        };
    }

    /**
     * 更新批改规则
     */
    updateRules(rules: Partial<GradingRules>): void {
        this.rules = {
            ...this.rules,
            ...rules
        };
        logger.info('批改规则已更新', this.rules);
    }

    /**
     * 批改单个题目
     * Grade a single question
     */
    async gradeQuestion(question: Question): Promise<GradingResult> {
        logger.debug(`开始批改题目 ${question.id}`, question);

        switch (question.type) {
            case QuestionType.MULTIPLE_CHOICE:
                return this.gradeMultipleChoice(question);
            case QuestionType.FILL_IN_BLANK:
                return this.gradeFillInBlank(question);
            case QuestionType.SHORT_ANSWER:
                return await this.gradeShortAnswer(question);
            default:
                return this.createUnknownResult(question);
        }
    }

    /**
     * 批量批改题目
     * Batch grade questions
     */
    async batchGrade(questions: Question[]): Promise<GradingResult[]> {
        logger.info(`开始批量批改 ${questions.length} 个题目`);
        
        const results: GradingResult[] = [];
        
        for (const question of questions) {
            try {
                const result = await this.gradeQuestion(question);
                results.push(result);
                logger.info(`题目 ${question.id} 批改完成`, result);
            } catch (error) {
                logger.error(`题目 ${question.id} 批改失败`, error);
                results.push(this.createErrorResult(question, error as Error));
            }
        }

        logger.info('批量批改完成', {
            total: questions.length,
            completed: results.length
        });

        return results;
    }

    /**
     * 批改选择题
     */
    private gradeMultipleChoice(question: Question): GradingResult {
        logger.debug('批改选择题', question.id);

        const maxScore = question.maxScore || 5;
        
        if (!question.standardAnswer) {
            return {
                questionId: question.id,
                type: question.type,
                score: 0,
                maxScore,
                passed: false,
                feedback: '缺少标准答案，无法批改',
                suggestions: ['请检查题目配置，确保有标准答案']
            };
        }

        let studentAnswer = question.studentAnswer;
        let standardAnswer = question.standardAnswer;

        // 应用规则
        if (this.rules.multipleChoice.trimWhitespace) {
            studentAnswer = studentAnswer.trim();
            standardAnswer = standardAnswer.trim();
        }

        if (!this.rules.multipleChoice.caseSensitive) {
            studentAnswer = studentAnswer.toLowerCase();
            standardAnswer = standardAnswer.toLowerCase();
        }

        const isCorrect = studentAnswer === standardAnswer;
        const score = isCorrect ? maxScore : 0;

        return {
            questionId: question.id,
            type: question.type,
            score,
            maxScore,
            passed: isCorrect,
            feedback: isCorrect ? '✅ 回答正确！' : '❌ 回答错误',
            suggestions: isCorrect ? ['做得很好！'] : [`正确答案是: ${question.standardAnswer}`],
            details: {
                correctAnswer: question.standardAnswer
            }
        };
    }

    /**
     * 批改填空题
     */
    private gradeFillInBlank(question: Question): GradingResult {
        logger.debug('批改填空题', question.id);

        const maxScore = question.maxScore || 5;

        if (!question.standardAnswer) {
            return {
                questionId: question.id,
                type: question.type,
                score: 0,
                maxScore,
                passed: false,
                feedback: '缺少标准答案，无法批改',
                suggestions: ['请检查题目配置，确保有标准答案']
            };
        }

        // 处理多个填空（用|||分隔）
        const studentAnswers = question.studentAnswer.split('|||');
        const standardAnswers = question.standardAnswer.split('|||');

        if (studentAnswers.length !== standardAnswers.length) {
            logger.warn('学生答案数量与标准答案数量不匹配');
        }

        let correctCount = 0;
        const totalBlanks = Math.max(studentAnswers.length, standardAnswers.length);

        for (let i = 0; i < totalBlanks; i++) {
            const studentAns = studentAnswers[i] || '';
            const standardAns = standardAnswers[i] || '';

            if (this.compareFillInBlankAnswer(studentAns, standardAns)) {
                correctCount++;
            }
        }

        const score = (correctCount / totalBlanks) * maxScore;
        const passed = correctCount === totalBlanks;

        return {
            questionId: question.id,
            type: question.type,
            score: Math.round(score * 10) / 10,
            maxScore,
            passed,
            feedback: passed 
                ? '✅ 全部正确！' 
                : `⚠️ 部分正确 (${correctCount}/${totalBlanks})`,
            suggestions: passed 
                ? ['做得很好！'] 
                : [`正确答案: ${question.standardAnswer}`],
            details: {
                correctAnswer: question.standardAnswer,
                similarity: correctCount / totalBlanks
            }
        };
    }

    /**
     * 比较填空题答案（支持模糊匹配）
     */
    private compareFillInBlankAnswer(studentAns: string, standardAns: string): boolean {
        let student = studentAns;
        let standard = standardAns;

        // 应用规则
        if (this.rules.fillInBlank.trimWhitespace) {
            student = student.trim();
            standard = standard.trim();
        }

        if (this.rules.fillInBlank.ignoreCase) {
            student = student.toLowerCase();
            standard = standard.toLowerCase();
        }

        // 精确匹配
        if (student === standard) {
            return true;
        }

        // 模糊匹配
        if (this.rules.fillInBlank.fuzzyMatch) {
            // 检查同义词
            if (this.isSynonym(student, standard)) {
                return true;
            }

            // 计算相似度
            const similarity = this.calculateSimilarity(student, standard);
            if (similarity >= this.rules.fillInBlank.similarityThreshold) {
                logger.debug(`模糊匹配成功 (相似度: ${similarity})`);
                return true;
            }
        }

        return false;
    }

    /**
     * 检查是否为同义词
     */
    private isSynonym(word1: string, word2: string): boolean {
        const synonyms = this.rules.fillInBlank.synonyms;
        
        for (const [key, values] of Object.entries(synonyms)) {
            if (key === word1 && values.includes(word2)) return true;
            if (key === word2 && values.includes(word1)) return true;
            if (values.includes(word1) && values.includes(word2)) return true;
        }

        return false;
    }

    /**
     * 计算字符串相似度（简单Levenshtein距离）
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const len1 = str1.length;
        const len2 = str2.length;

        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;

        const matrix: number[][] = [];

        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        return 1 - (distance / maxLen);
    }

    /**
     * 批改简答题（基于规则 + 预留AI接口）
     */
    private async gradeShortAnswer(question: Question): Promise<GradingResult> {
        logger.debug('批改简答题', question.id);

        const maxScore = question.maxScore || 10;
        const answer = question.studentAnswer;

        // 基本检查
        if (!answer || answer.trim().length === 0) {
            return {
                questionId: question.id,
                type: question.type,
                score: 0,
                maxScore,
                passed: false,
                feedback: '❌ 未作答',
                suggestions: ['请完成题目作答']
            };
        }

        // 字数统计
        const wordCount = this.countWords(answer);
        let score = 0;
        const suggestions: string[] = [];
        const keywordsFound: string[] = [];

        // 字数判断
        if (wordCount < this.rules.shortAnswer.minWordCount) {
            suggestions.push(`字数不足，建议至少${this.rules.shortAnswer.minWordCount}字，当前${wordCount}字`);
            score += maxScore * 0.2; // 给20%的分
        } else if (wordCount > this.rules.shortAnswer.maxWordCount) {
            suggestions.push(`字数过多，建议不超过${this.rules.shortAnswer.maxWordCount}字，当前${wordCount}字`);
            score += maxScore * 0.6;
        } else {
            score += maxScore * 0.5; // 字数合适给50%
        }

        // 关键词匹配
        if (this.rules.shortAnswer.keywordMatching && question.standardAnswer) {
            const keywords = this.extractKeywords(question.standardAnswer);
            for (const keyword of keywords) {
                if (answer.includes(keyword)) {
                    keywordsFound.push(keyword);
                    score += maxScore * 0.1; // 每个关键词加10%
                }
            }

            if (keywordsFound.length === 0) {
                suggestions.push('答案中缺少关键要点');
            } else {
                suggestions.push(`答案包含 ${keywordsFound.length} 个关键要点`);
            }
        }

        score = Math.min(score, maxScore); // 不超过满分
        const passed = score >= maxScore * 0.6; // 60分及格

        return {
            questionId: question.id,
            type: question.type,
            score: Math.round(score * 10) / 10,
            maxScore,
            passed,
            feedback: passed 
                ? `✅ 回答合格 (${Math.round((score/maxScore)*100)}%)` 
                : `⚠️ 回答需改进 (${Math.round((score/maxScore)*100)}%)`,
            suggestions: suggestions.length > 0 
                ? suggestions 
                : ['回答基本符合要求'],
            details: {
                wordCount,
                keywordsFound,
                correctAnswer: question.standardAnswer
            }
        };

        // TODO: 如果启用AI，调用AI服务进行更精准的评分
        // if (this.rules.shortAnswer.useAI) {
        //     return await this.gradeWithAI(question);
        // }
    }

    /**
     * 统计字数
     */
    private countWords(text: string): number {
        // 中文字符 + 英文单词
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
        const englishWords = text.match(/[a-zA-Z]+/g) || [];
        return chineseChars.length + englishWords.length;
    }

    /**
     * 提取关键词
     */
    private extractKeywords(text: string): string[] {
        // 简单的关键词提取：去除标点，按长度过滤
        const words = text
            .replace(/[，。！？、；：""''（）《》【】\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length >= 2); // 至少2个字

        return [...new Set(words)]; // 去重
    }

    /**
     * 创建未知类型结果
     */
    private createUnknownResult(question: Question): GradingResult {
        return {
            questionId: question.id,
            type: question.type,
            score: 0,
            maxScore: 0,
            passed: false,
            feedback: '⚠️ 无法识别题目类型',
            suggestions: ['请检查题目格式或手动批改']
        };
    }

    /**
     * 创建错误结果
     */
    private createErrorResult(question: Question, error: Error): GradingResult {
        return {
            questionId: question.id,
            type: question.type,
            score: 0,
            maxScore: 0,
            passed: false,
            feedback: `❌ 批改失败: ${error.message}`,
            suggestions: ['请重试或联系技术支持']
        };
    }
}
