/**
 * 内容提取模块
 * Content extraction module for homework pages
 */

import { Question } from './types';
import { QuestionDetector } from './questionDetector';
import { logger } from './logger';

export class ContentExtractor {
    private detector: QuestionDetector;

    constructor() {
        this.detector = new QuestionDetector();
    }

    /**
     * 从页面提取所有题目
     * Extract all questions from the page
     */
    extractAllQuestions(): Question[] {
        logger.info('开始从页面提取题目...');
        
        const questions: Question[] = [];
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
    private findQuestionElements(): HTMLElement[] {
        logger.debug('查找题目元素...');

        const elements: HTMLElement[] = [];

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
            } catch (e) {
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
    private findByStructure(): HTMLElement[] {
        const elements: HTMLElement[] = [];

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
    private findByKeywords(): HTMLElement[] {
        const elements: HTMLElement[] = [];
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
    isHomeworkPage(): boolean {
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
    extractPageMetadata(): {
        title: string;
        url: string;
        studentName?: string;
        homeworkId?: string;
    } {
        const metadata = {
            title: document.title,
            url: window.location.href,
            studentName: undefined as string | undefined,
            homeworkId: undefined as string | undefined
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
