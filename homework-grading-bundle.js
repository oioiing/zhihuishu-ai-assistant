
/**
 * 智慧树作业自动批改系统 - 打包版本
 * Bundled by build script
 */

(function() {
    'use strict';
    
    // 创建模块命名空间
    const ZhiHuiShuGrading = {};
    

// ===== types.js =====
/**
 * 智慧树作业自动批改系统 - 类型定义
 * Type definitions for homework auto-grading system
 */
/**
 * 题型枚举
 * Question type enum
 */
ZhiHuiShuGrading.QuestionType;
(function (QuestionType) {
    QuestionType["MULTIPLE_CHOICE"] = "multiple_choice";
    QuestionType["FILL_IN_BLANK"] = "fill_in_blank";
    QuestionType["SHORT_ANSWER"] = "short_answer";
    QuestionType["UNKNOWN"] = "unknown"; // 未知类型
})(QuestionType || (QuestionType = {}));
/**
 * 日志级别
 * Log level
 */
ZhiHuiShuGrading.LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (LogLevel = {}));
//# sourceMappingURL=types.js.map

// ===== logger.js =====
/**
 * 日志工具模块
 * Logger utility module
 */
import { LogLevel } from './types';
ZhiHuiShuGrading.Logger {
    constructor(config) {
        this.config = {
            enabled: true,
            level: LogLevel.INFO,
            prefix: '[ZhiHuiShu-Grading]',
            showTimestamp: true,
            ...config
        };
    }
    /**
     * 获取时间戳字符串
     */
    getTimestamp() {
        if (!this.config.showTimestamp)
            return '';
        const now = new Date();
        return `[${now.toLocaleTimeString()}.${now.getMilliseconds()}]`;
    }
    /**
     * 判断日志级别是否应该输出
     */
    shouldLog(level) {
        if (!this.config.enabled)
            return false;
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const currentIndex = levels.indexOf(this.config.level);
        const messageIndex = levels.indexOf(level);
        return messageIndex >= currentIndex;
    }
    /**
     * 格式化日志消息
     */
    format(level, message, ...args) {
        const timestamp = this.getTimestamp();
        const prefix = `${timestamp}${this.config.prefix}[${level}]`;
        return [prefix, message, ...args];
    }
    /**
     * DEBUG级别日志
     */
    debug(message, ...args) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(...this.format(LogLevel.DEBUG, message, ...args));
        }
    }
    /**
     * INFO级别日志
     */
    info(message, ...args) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.info(...this.format(LogLevel.INFO, message, ...args));
        }
    }
    /**
     * WARN级别日志
     */
    warn(message, ...args) {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(...this.format(LogLevel.WARN, message, ...args));
        }
    }
    /**
     * ERROR级别日志
     */
    error(message, ...args) {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(...this.format(LogLevel.ERROR, message, ...args));
        }
    }
    /**
     * 分组日志开始
     */
    group(label) {
        if (this.config.enabled) {
            console.group(`${this.config.prefix} ${label}`);
        }
    }
    /**
     * 分组日志结束
     */
    groupEnd() {
        if (this.config.enabled) {
            console.groupEnd();
        }
    }
    /**
     * 表格日志
     */
    table(data) {
        if (this.config.enabled) {
            console.table(data);
        }
    }
    /**
     * 更新配置
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
// 导出默认实例
ZhiHuiShuGrading.logger = new Logger({
    enabled: true,
    level: LogLevel.DEBUG,
    prefix: '[智慧树批改]',
    showTimestamp: true
});
//# sourceMappingURL=logger.js.map

// ===== questionDetector.js =====
/**
 * 题型识别模块
 * Question type detection module
 */
import { QuestionType } from './types';
import { logger } from './logger';
ZhiHuiShuGrading.QuestionDetector {
    /**
     * 识别题目类型
     * Detect question type from element
     */
    detectQuestionType(element) {
        logger.debug('识别题目类型', element);
        const text = element.textContent?.toLowerCase() || '';
        const html = element.innerHTML.toLowerCase();
        // 检查选择题特征
        if (this.isMultipleChoice(element, text, html)) {
            logger.debug('识别为选择题');
            return QuestionType.MULTIPLE_CHOICE;
        }
        // 检查填空题特征
        if (this.isFillInBlank(element, text, html)) {
            logger.debug('识别为填空题');
            return QuestionType.FILL_IN_BLANK;
        }
        // 检查简答题特征
        if (this.isShortAnswer(element, text, html)) {
            logger.debug('识别为简答题');
            return QuestionType.SHORT_ANSWER;
        }
        logger.warn('未能识别题目类型，标记为UNKNOWN');
        return QuestionType.UNKNOWN;
    }
    /**
     * 判断是否为选择题
     */
    isMultipleChoice(element, text, _html) {
        // 关键词匹配
        const keywords = [
            '单选', '多选', '选择题',
            'multiple choice', 'single choice',
            '（a）', '（b）', '（c）', '（d）',
            '(a)', '(b)', '(c)', '(d)',
            'a.', 'b.', 'c.', 'd.'
        ];
        if (keywords.some(keyword => text.includes(keyword))) {
            return true;
        }
        // 检查是否有选项按钮或checkbox
        const hasOptions = element.querySelectorAll('input[type="radio"], input[type="checkbox"]').length > 0;
        if (hasOptions) {
            return true;
        }
        // 检查是否有选项标记
        const optionPattern = /[①②③④⑤⑥⑦⑧⑨⑩]|[ABCDEFG][\.\)、]/gi;
        const optionMatches = text.match(optionPattern);
        if (optionMatches && optionMatches.length >= 2) {
            return true;
        }
        return false;
    }
    /**
     * 判断是否为填空题
     */
    isFillInBlank(element, text, _html) {
        // 关键词匹配
        const keywords = [
            '填空', '填写', 'fill in', 'blank',
            '___', '______', '（  ）', '(  )'
        ];
        if (keywords.some(keyword => text.includes(keyword))) {
            return true;
        }
        // 检查是否有input输入框
        const hasInputs = element.querySelectorAll('input[type="text"]').length > 0;
        if (hasInputs) {
            return true;
        }
        // 检查下划线或括号
        const blankPattern = /_{3,}|\([\s]{2,}\)|（[\s]{2,}）/g;
        if (blankPattern.test(text)) {
            return true;
        }
        return false;
    }
    /**
     * 判断是否为简答题
     */
    isShortAnswer(element, text, _html) {
        // 关键词匹配
        const keywords = [
            '简答', '论述', '分析', '说明', '阐述',
            'short answer', 'essay', 'explain', 'describe'
        ];
        if (keywords.some(keyword => text.includes(keyword))) {
            return true;
        }
        // 检查是否有textarea
        const hasTextarea = element.querySelectorAll('textarea').length > 0;
        if (hasTextarea) {
            return true;
        }
        // 检查是否有大段文字输入区域
        const hasLargeInput = Array.from(element.querySelectorAll('input')).some(input => {
            const width = parseInt(input.style.width || '0');
            return width > 300;
        });
        if (hasLargeInput) {
            return true;
        }
        return false;
    }
    /**
     * 从元素中提取题目信息
     * Extract question info from element
     */
    extractQuestion(element, index) {
        try {
            logger.debug(`提取题目信息 #${index}`, element);
            const type = this.detectQuestionType(element);
            const content = this.extractQuestionContent(element);
            const studentAnswer = this.extractStudentAnswer(element, type);
            const standardAnswer = this.extractStandardAnswer(element);
            const options = type === QuestionType.MULTIPLE_CHOICE ? this.extractOptions(element) : undefined;
            const question = {
                id: `question-${index}`,
                type,
                element,
                content,
                studentAnswer,
                standardAnswer,
                options
            };
            logger.info(`成功提取题目 #${index}:`, {
                type,
                content: content.substring(0, 50) + '...',
                studentAnswer: studentAnswer.substring(0, 30) + '...'
            });
            return question;
        }
        catch (error) {
            logger.error(`提取题目 #${index} 失败:`, error);
            return null;
        }
    }
    /**
     * 提取题目内容
     */
    extractQuestionContent(element) {
        // 尝试通过特定class或结构提取
        const questionText = element.querySelector('.question-text, .question-content, .q-text, .title');
        if (questionText) {
            return questionText.textContent?.trim() || '';
        }
        // 否则提取第一个主要文本节点
        const text = element.textContent?.trim() || '';
        // 截取第一行或前200个字符作为题目内容
        return text.split('\n')[0].substring(0, 200);
    }
    /**
     * 提取学生答案
     */
    extractStudentAnswer(element, type) {
        switch (type) {
            case QuestionType.MULTIPLE_CHOICE:
                return this.extractMultipleChoiceAnswer(element);
            case QuestionType.FILL_IN_BLANK:
                return this.extractFillInBlankAnswer(element);
            case QuestionType.SHORT_ANSWER:
                return this.extractShortAnswerText(element);
            default:
                return '';
        }
    }
    /**
     * 提取选择题答案
     */
    extractMultipleChoiceAnswer(element) {
        // 查找选中的radio或checkbox
        const selected = element.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked');
        if (selected.length > 0) {
            return Array.from(selected).map(input => input.value).join(',');
        }
        // 查找标记为选中的选项
        const selectedOption = element.querySelector('.selected, .active, .checked');
        if (selectedOption) {
            return selectedOption.textContent?.trim() || '';
        }
        return '';
    }
    /**
     * 提取填空题答案
     */
    extractFillInBlankAnswer(element) {
        // 查找input输入框
        const inputs = element.querySelectorAll('input[type="text"]');
        if (inputs.length > 0) {
            return Array.from(inputs).map(input => input.value).join('|||');
        }
        return '';
    }
    /**
     * 提取简答题答案
     */
    extractShortAnswerText(element) {
        // 查找textarea
        const textarea = element.querySelector('textarea');
        if (textarea) {
            return textarea.value;
        }
        // 查找大的input框
        const input = element.querySelector('input[type="text"]');
        if (input) {
            return input.value;
        }
        // 查找答案区域
        const answerArea = element.querySelector('.answer, .student-answer, .response');
        if (answerArea) {
            return answerArea.textContent?.trim() || '';
        }
        return '';
    }
    /**
     * 提取标准答案
     */
    extractStandardAnswer(element) {
        // 查找标准答案区域
        const standardAnswerArea = element.querySelector('.standard-answer, .correct-answer, .reference-answer, [class*="standard"]');
        if (standardAnswerArea) {
            return standardAnswerArea.textContent?.trim();
        }
        return undefined;
    }
    /**
     * 提取选择题选项
     */
    extractOptions(element) {
        const options = [];
        // 查找选项元素
        const optionElements = element.querySelectorAll('.option, .choice, label[for], [class*="option"]');
        optionElements.forEach(opt => {
            const text = opt.textContent?.trim();
            if (text) {
                options.push(text);
            }
        });
        // 如果没找到，尝试通过文本模式匹配
        if (options.length === 0) {
            const text = element.textContent || '';
            const lines = text.split('\n');
            lines.forEach(line => {
                if (/^[A-G][\.\)、]/.test(line.trim())) {
                    options.push(line.trim());
                }
            });
        }
        return options;
    }
}
//# sourceMappingURL=questionDetector.js.map

// ===== contentExtractor.js =====
/**
 * 内容提取模块
 * Content extraction module for homework pages
 */
import { QuestionDetector } from './questionDetector';
import { logger } from './logger';
ZhiHuiShuGrading.ContentExtractor {
    constructor() {
        this.detector = new QuestionDetector();
    }
    /**
     * 从页面提取所有题目
     * Extract all questions from the page
     */
    extractAllQuestions() {
        logger.info('开始从页面提取题目...');
        const questions = [];
        const questionElements = this.findQuestionElements();
        logger.info(`找到 ${questionElements.length} 个潜在题目元素`);
        questionElements.forEach((element, index) => {
            const question = this.detector.extractQuestion(element, index + 1);
            if (question) {
                questions.push(question);
            }
        });
        logger.info(`成功提取 ${questions.length} 个题目`);
        logger.table(questions.map(q => ({
            id: q.id,
            type: q.type,
            content: q.content.substring(0, 50) + '...'
        })));
        return questions;
    }
    /**
     * 查找页面中的题目元素
     * Find question elements in the page
     */
    findQuestionElements() {
        logger.debug('查找题目元素...');
        const elements = [];
        // 策略1: 通过常见的题目容器class查找
        const commonSelectors = [
            '.question-item',
            '.question-box',
            '.question',
            '.problem',
            '.exercise-item',
            '.homework-item',
            '[class*="question"]',
            '[class*="problem"]',
            '[class*="exercise"]',
            '[id*="question"]',
            '[data-question]',
            '.q-item',
            '.que-item'
        ];
        commonSelectors.forEach(selector => {
            try {
                const found = document.querySelectorAll(selector);
                found.forEach(el => {
                    if (el instanceof HTMLElement && !elements.includes(el)) {
                        elements.push(el);
                    }
                });
            }
            catch (e) {
                // 忽略无效选择器
            }
        });
        if (elements.length > 0) {
            logger.debug(`通过选择器找到 ${elements.length} 个题目元素`);
            return elements;
        }
        // 策略2: 通过页面结构特征查找
        const structuralElements = this.findByStructure();
        if (structuralElements.length > 0) {
            logger.debug(`通过结构特征找到 ${structuralElements.length} 个题目元素`);
            return structuralElements;
        }
        // 策略3: 通过关键词查找
        const keywordElements = this.findByKeywords();
        if (keywordElements.length > 0) {
            logger.debug(`通过关键词找到 ${keywordElements.length} 个题目元素`);
            return keywordElements;
        }
        logger.warn('未找到题目元素');
        return [];
    }
    /**
     * 通过页面结构特征查找题目
     */
    findByStructure() {
        const elements = [];
        // 查找包含题号的元素（如 1. 2. 3. 或 第1题 第2题）
        const allElements = document.querySelectorAll('div, section, article, li');
        allElements.forEach(el => {
            const text = el.textContent?.trim() || '';
            // 匹配题号模式
            const questionNumberPattern = /^(?:\d+[\.、\)）]|第\d+[题問]|Question\s*\d+)/i;
            if (questionNumberPattern.test(text.split('\n')[0])) {
                // 检查是否包含答题相关元素
                const hasInputs = el.querySelectorAll('input, textarea, select').length > 0;
                const hasOptions = /[A-G][\.\)、]/.test(text);
                if (hasInputs || hasOptions) {
                    if (el instanceof HTMLElement && !elements.includes(el)) {
                        elements.push(el);
                    }
                }
            }
        });
        return elements;
    }
    /**
     * 通过关键词查找题目
     */
    findByKeywords() {
        const elements = [];
        const keywords = [
            '选择题', '填空题', '简答题', '问答题',
            '单选', '多选', '判断',
            'multiple choice', 'fill in', 'short answer'
        ];
        const allElements = document.querySelectorAll('div, section, article');
        allElements.forEach(el => {
            const text = el.textContent?.toLowerCase() || '';
            if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
                // 确保不是纯标题元素
                const hasContent = el.querySelectorAll('input, textarea, p, span').length > 0;
                if (hasContent && el instanceof HTMLElement && !elements.includes(el)) {
                    elements.push(el);
                }
            }
        });
        return elements;
    }
    /**
     * 检测当前页面是否为作业批改页面
     * Detect if current page is a homework correction page
     */
    isHomeworkPage() {
        const url = window.location.href;
        const title = document.title;
        // 检查URL特征
        const urlKeywords = [
            'homework', 'homeworkCorrect', 'exercise', 'assignment',
            'zuoye', '作业', 'lianxi', '练习'
        ];
        if (urlKeywords.some(keyword => url.toLowerCase().includes(keyword.toLowerCase()))) {
            logger.info('通过URL识别为作业页面');
            return true;
        }
        // 检查标题特征
        const titleKeywords = ['作业', '练习', '习题', 'homework', 'exercise', 'assignment'];
        if (titleKeywords.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()))) {
            logger.info('通过标题识别为作业页面');
            return true;
        }
        // 检查页面内容特征
        const hasQuestionContent = this.findQuestionElements().length > 0;
        if (hasQuestionContent) {
            logger.info('通过页面内容识别为作业页面');
            return true;
        }
        logger.debug('当前页面不是作业页面');
        return false;
    }
    /**
     * 提取页面元数据
     * Extract page metadata
     */
    extractPageMetadata() {
        const metadata = {
            title: document.title,
            url: window.location.href,
            studentName: undefined,
            homeworkId: undefined
        };
        // 尝试从URL中提取作业ID
        const urlMatch = metadata.url.match(/homework[^\/]*\/(\d+)/i);
        if (urlMatch) {
            metadata.homeworkId = urlMatch[1];
        }
        // 尝试提取学生姓名
        const nameElement = document.querySelector('.student-name, [class*="student"], [class*="name"]');
        if (nameElement) {
            metadata.studentName = nameElement.textContent?.trim();
        }
        logger.debug('页面元数据:', metadata);
        return metadata;
    }
}
//# sourceMappingURL=contentExtractor.js.map

// ===== gradingEngine.js =====
/**
 * 批改引擎模块
 * Grading engine module
 */
import { QuestionType } from './types';
import { logger } from './logger';
ZhiHuiShuGrading.GradingEngine {
    constructor(rules) {
        this.rules = this.getDefaultRules();
        if (rules) {
            this.updateRules(rules);
        }
    }
    /**
     * 获取默认批改规则
     */
    getDefaultRules() {
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
    updateRules(rules) {
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
    async gradeQuestion(question) {
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
    async batchGrade(questions) {
        logger.info(`开始批量批改 ${questions.length} 个题目`);
        const results = [];
        for (const question of questions) {
            try {
                const result = await this.gradeQuestion(question);
                results.push(result);
                logger.info(`题目 ${question.id} 批改完成`, result);
            }
            catch (error) {
                logger.error(`题目 ${question.id} 批改失败`, error);
                results.push(this.createErrorResult(question, error));
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
    gradeMultipleChoice(question) {
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
    gradeFillInBlank(question) {
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
    compareFillInBlankAnswer(studentAns, standardAns) {
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
    isSynonym(word1, word2) {
        const synonyms = this.rules.fillInBlank.synonyms;
        for (const [key, values] of Object.entries(synonyms)) {
            if (key === word1 && values.includes(word2))
                return true;
            if (key === word2 && values.includes(word1))
                return true;
            if (values.includes(word1) && values.includes(word2))
                return true;
        }
        return false;
    }
    /**
     * 计算字符串相似度（简单Levenshtein距离）
     */
    calculateSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        if (len1 === 0)
            return len2 === 0 ? 1 : 0;
        if (len2 === 0)
            return 0;
        const matrix = [];
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        return 1 - (distance / maxLen);
    }
    /**
     * 批改简答题（基于规则 + 预留AI接口）
     */
    async gradeShortAnswer(question) {
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
        const suggestions = [];
        const keywordsFound = [];
        // 字数判断
        if (wordCount < this.rules.shortAnswer.minWordCount) {
            suggestions.push(`字数不足，建议至少${this.rules.shortAnswer.minWordCount}字，当前${wordCount}字`);
            score += maxScore * 0.2; // 给20%的分
        }
        else if (wordCount > this.rules.shortAnswer.maxWordCount) {
            suggestions.push(`字数过多，建议不超过${this.rules.shortAnswer.maxWordCount}字，当前${wordCount}字`);
            score += maxScore * 0.6;
        }
        else {
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
            }
            else {
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
                ? `✅ 回答合格 (${Math.round((score / maxScore) * 100)}%)`
                : `⚠️ 回答需改进 (${Math.round((score / maxScore) * 100)}%)`,
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
    countWords(text) {
        // 中文字符 + 英文单词
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
        const englishWords = text.match(/[a-zA-Z]+/g) || [];
        return chineseChars.length + englishWords.length;
    }
    /**
     * 提取关键词
     */
    extractKeywords(text) {
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
    createUnknownResult(question) {
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
    createErrorResult(question, error) {
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
//# sourceMappingURL=gradingEngine.js.map

// ===== aiService.js =====
/**
 * AI服务模块
 * AI service module for advanced grading
 */
import { logger } from './logger';
/**
 * DeepSeek AI服务实现
 */
ZhiHuiShuGrading.DeepSeekAIService {
    constructor(apiKey) {
        this.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
        this.apiKey = apiKey || '';
    }
    /**
     * 分析简答题
     */
    async analyzeShortAnswer(question, studentAnswer, standardAnswer) {
        logger.info('使用AI分析简答题');
        if (!this.apiKey) {
            throw new Error('AI服务未配置API密钥');
        }
        const prompt = this.buildPrompt(question, studentAnswer, standardAnswer);
        try {
            const response = await this.callAPI(prompt);
            return this.parseResponse(response);
        }
        catch (error) {
            logger.error('AI服务调用失败:', error);
            throw error;
        }
    }
    /**
     * 批量分析
     */
    async batchAnalyze(questions) {
        logger.info(`批量AI分析 ${questions.length} 个题目`);
        const results = [];
        for (const question of questions) {
            try {
                const result = await this.analyzeShortAnswer(question.content, question.studentAnswer, question.standardAnswer);
                results.push(result);
            }
            catch (error) {
                logger.error(`题目 ${question.id} AI分析失败:`, error);
                results.push(this.createFallbackResult());
            }
        }
        return results;
    }
    /**
     * 构建AI提示词
     */
    buildPrompt(question, studentAnswer, standardAnswer) {
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
    async callAPI(prompt) {
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
    parseResponse(response) {
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
    createFallbackResult() {
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
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        logger.info('AI服务API密钥已更新');
    }
    /**
     * 检查服务是否可用
     */
    async checkAvailability() {
        if (!this.apiKey) {
            logger.warn('AI服务未配置API密钥');
            return false;
        }
        try {
            await this.callAPI('测试连接');
            logger.info('AI服务可用');
            return true;
        }
        catch (error) {
            logger.error('AI服务不可用:', error);
            return false;
        }
    }
}
/**
 * 规则引擎服务（本地评分，不依赖AI）
 */
ZhiHuiShuGrading.RuleEngineService {
    async analyzeShortAnswer(_question, studentAnswer, standardAnswer) {
        logger.info('使用规则引擎分析简答题');
        const wordCount = this.countWords(studentAnswer);
        let score = 5; // 基础分
        const suggestions = [];
        // 字数评分
        if (wordCount < 10) {
            score -= 2;
            suggestions.push('答案字数较少，建议补充更多内容');
        }
        else if (wordCount > 200) {
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
            }
            else {
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
    async batchAnalyze(questions) {
        const results = [];
        for (const question of questions) {
            const result = await this.analyzeShortAnswer(question.content, question.studentAnswer, question.standardAnswer);
            results.push(result);
        }
        return results;
    }
    countWords(text) {
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
        const englishWords = text.match(/[a-zA-Z]+/g) || [];
        return chineseChars.length + englishWords.length;
    }
    extractKeywords(text) {
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
ZhiHuiShuGrading.AIServiceFactory {
    /**
     * 获取DeepSeek AI服务
     */
    static getDeepSeekService(apiKey) {
        if (!this.deepseekService) {
            this.deepseekService = new DeepSeekAIService(apiKey);
        }
        else if (apiKey) {
            this.deepseekService.setApiKey(apiKey);
        }
        return this.deepseekService;
    }
    /**
     * 获取规则引擎服务
     */
    static getRuleEngineService() {
        if (!this.ruleEngineService) {
            this.ruleEngineService = new RuleEngineService();
        }
        return this.ruleEngineService;
    }
    /**
     * 根据配置获取合适的服务
     */
    static async getService(useAI = false, apiKey) {
        if (useAI && apiKey) {
            const aiService = this.getDeepSeekService(apiKey);
            const isAvailable = await aiService.checkAvailability();
            if (isAvailable) {
                logger.info('使用DeepSeek AI服务');
                return aiService;
            }
            else {
                logger.warn('AI服务不可用，降级为规则引擎');
            }
        }
        logger.info('使用规则引擎服务');
        return this.getRuleEngineService();
    }
}
AIServiceFactory.deepseekService = null;
AIServiceFactory.ruleEngineService = null;
//# sourceMappingURL=aiService.js.map

// ===== feedbackRenderer.js =====
/**
 * 反馈渲染模块
 * Feedback rendering module for displaying grading results
 */
import { QuestionType } from './types';
import { logger } from './logger';
ZhiHuiShuGrading.FeedbackRenderer {
    constructor() {
        this.styleInjected = false;
        this.injectStyles();
    }
    /**
     * 注入样式
     */
    injectStyles() {
        if (this.styleInjected)
            return;
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
    renderFeedback(result, question) {
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
    batchRenderFeedback(results, questions) {
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
    getFeedbackClass(result) {
        const baseClass = 'zhs-feedback-card';
        if (result.passed) {
            return `${baseClass} zhs-feedback-passed`;
        }
        else if (result.score > 0) {
            return `${baseClass} zhs-feedback-partial`;
        }
        else {
            return `${baseClass} zhs-feedback-failed`;
        }
    }
    /**
     * 生成反馈HTML
     */
    generateFeedbackHTML(result) {
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
    getTypeLabel(type) {
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
    renderBatchPanel(totalQuestions, onGradeAll, onClose) {
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
        const gradeAllBtn = panel.querySelector('#zhs-grade-all-btn');
        const closeBtn = panel.querySelector('#zhs-close-panel-btn');
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
    updateBatchProgress(gradedCount, totalCount) {
        const countEl = document.querySelector('#zhs-graded-count');
        const fillEl = document.querySelector('#zhs-progress-fill');
        const btnEl = document.querySelector('#zhs-grade-all-btn');
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
    showSummary(results) {
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
//# sourceMappingURL=feedbackRenderer.js.map

// ===== homeworkGrader.js =====
/**
 * 作业自动批改主模块
 * Main homework auto-grading module
 */
import { ContentExtractor } from './contentExtractor';
import { GradingEngine } from './gradingEngine';
import { FeedbackRenderer } from './feedbackRenderer';
import { AIServiceFactory } from './aiService';
import { logger } from './logger';
ZhiHuiShuGrading.HomeworkGrader {
    constructor(rules) {
        this.currentSession = null;
        this.extractor = new ContentExtractor();
        this.engine = new GradingEngine(rules);
        this.renderer = new FeedbackRenderer();
        logger.info('作业批改系统初始化完成');
    }
    /**
     * 检查当前页面是否为作业页面
     */
    isHomeworkPage() {
        return this.extractor.isHomeworkPage();
    }
    /**
     * 初始化批改会话
     */
    async initializeSession() {
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
    async gradeQuestion(questionId) {
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
        }
        else {
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
    async gradeAllQuestions(onProgress) {
        if (!this.currentSession) {
            await this.initializeSession();
        }
        if (!this.currentSession) {
            throw new Error('会话初始化失败');
        }
        logger.info(`开始批改所有题目 (共 ${this.currentSession.questions.length} 题)`);
        const questions = this.currentSession.questions;
        const results = [];
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
            }
            catch (error) {
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
    showBatchPanel() {
        if (!this.currentSession) {
            logger.warn('请先初始化会话');
            return;
        }
        this.renderer.renderBatchPanel(this.currentSession.questions.length, () => {
            this.gradeAllQuestions((current, total) => {
                this.renderer.updateBatchProgress(current, total);
            });
        }, () => {
            logger.info('批量操作面板已关闭');
        });
        logger.info('批量操作面板已显示');
    }
    /**
     * 更新批改规则
     */
    updateRules(rules) {
        this.engine.updateRules(rules);
        logger.info('批改规则已更新');
    }
    /**
     * 获取当前会话
     */
    getCurrentSession() {
        return this.currentSession;
    }
    /**
     * 获取批改结果
     */
    getResults() {
        return this.currentSession?.results || [];
    }
    /**
     * 导出批改报告
     */
    exportReport() {
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
    saveReport() {
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
    updateTotalScore() {
        if (!this.currentSession)
            return;
        this.currentSession.totalScore = this.currentSession.results.reduce((sum, result) => sum + result.score, 0);
    }
    /**
     * 计算通过率
     */
    calculatePassRate() {
        if (!this.currentSession || this.currentSession.results.length === 0) {
            return 0;
        }
        const passedCount = this.currentSession.results.filter(r => r.passed).length;
        return Math.round((passedCount / this.currentSession.results.length) * 100);
    }
    /**
     * 获取题型标签
     */
    getTypeLabel(type) {
        const labels = {
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
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * 启用AI批改（用于简答题）
     */
    async enableAIGrading(apiKey) {
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
            }
            else {
                logger.warn('AI服务不可用');
                return false;
            }
        }
        catch (error) {
            logger.error('启用AI批改失败:', error);
            return false;
        }
    }
    /**
     * 清理会话
     */
    cleanup() {
        this.currentSession = null;
        logger.info('批改会话已清理');
    }
}
// 导出全局实例
ZhiHuiShuGrading.homeworkGrader = new HomeworkGrader();
//# sourceMappingURL=homeworkGrader.js.map

// ===== index.js =====
/**
 * 智慧树作业自动批改系统
 * Zhihuishu Homework Auto-Grading System
 *
 * 主入口文件 - 导出所有模块和公共接口
 */
// 核心模块
 from './homeworkGrader';
 from './contentExtractor';
 from './questionDetector';
 from './gradingEngine';
 from './feedbackRenderer';
 from './aiService';
 from './logger';
// 类型定义
 from './types';
/**
 * 版本信息
 */
ZhiHuiShuGrading.VERSION = '2.0.0';
/**
 * 系统信息
 */
ZhiHuiShuGrading.SYSTEM_INFO = {
    name: '智慧树作业自动批改系统',
    version: VERSION,
    description: '支持选择题、填空题、简答题的自动批改，提供规则引擎和AI服务双模式',
    author: 'ZhiHuiShu AI Assistant Team',
    license: 'MIT'
};
/**
 * 初始化系统
 * Initialize the grading system
 */
ZhiHuiShuGrading.initialize() {
    import('./logger').then(({ logger: log }) => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║  ${SYSTEM_INFO.name} v${VERSION}  ║
╚═══════════════════════════════════════════════════════════╝
        `);
        log.info('系统初始化完成');
    });
}
/**
 * 快速启动函数
 * Quick start function for easy integration
 */
export async function quickStart() {
    initialize();
    const { logger: log } = await import('./logger');
    const { homeworkGrader: grader } = await import('./homeworkGrader');
    // 检查是否在作业页面
    if (grader.isHomeworkPage()) {
        log.info('检测到作业页面，准备初始化...');
        try {
            await grader.initializeSession();
            grader.showBatchPanel();
            log.info('批改系统已准备就绪');
        }
        catch (error) {
            log.error('初始化失败:', error);
        }
    }
    else {
        log.debug('当前不是作业页面');
    }
}
//# sourceMappingURL=index.js.map

    // 暴露到全局作用域
    window.ZhiHuiShuGrading = ZhiHuiShuGrading;
    
    // 为了方便使用，直接暴露 homeworkGrader
    if (ZhiHuiShuGrading.homeworkGrader) {
        window.homeworkGrader = ZhiHuiShuGrading.homeworkGrader;
        console.log('✅ 作业批改系统已加载到 window.homeworkGrader');
    }
    
    // 自动初始化
    if (ZhiHuiShuGrading.initialize) {
        ZhiHuiShuGrading.initialize();
    }
    
})();
