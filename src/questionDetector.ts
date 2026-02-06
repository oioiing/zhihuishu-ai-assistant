/**
 * 题型识别模块
 * Question type detection module
 */

import { Question, QuestionType } from './types';
import { logger } from './logger';

export class QuestionDetector {
    /**
     * 识别题目类型
     * Detect question type from element
     */
    detectQuestionType(element: HTMLElement): QuestionType {
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
    private isMultipleChoice(element: HTMLElement, text: string, _html: string): boolean {
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
    private isFillInBlank(element: HTMLElement, text: string, _html: string): boolean {
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
    private isShortAnswer(element: HTMLElement, text: string, _html: string): boolean {
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
        const hasLargeInput = Array.from(element.querySelectorAll('input')).some(
            input => {
                const width = parseInt((input as HTMLInputElement).style.width || '0');
                return width > 300;
            }
        );
        
        if (hasLargeInput) {
            return true;
        }

        return false;
    }

    /**
     * 从元素中提取题目信息
     * Extract question info from element
     */
    extractQuestion(element: HTMLElement, index: number): Question | null {
        try {
            logger.debug(`提取题目信息 #${index}`, element);

            const type = this.detectQuestionType(element);
            const content = this.extractQuestionContent(element);
            const studentAnswer = this.extractStudentAnswer(element, type);
            const standardAnswer = this.extractStandardAnswer(element);
            const options = type === QuestionType.MULTIPLE_CHOICE ? this.extractOptions(element) : undefined;

            const question: Question = {
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
        } catch (error) {
            logger.error(`提取题目 #${index} 失败:`, error);
            return null;
        }
    }

    /**
     * 提取题目内容
     */
    private extractQuestionContent(element: HTMLElement): string {
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
    private extractStudentAnswer(element: HTMLElement, type: QuestionType): string {
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
    private extractMultipleChoiceAnswer(element: HTMLElement): string {
        // 查找选中的radio或checkbox
        const selected = element.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked');
        if (selected.length > 0) {
            return Array.from(selected).map(input => (input as HTMLInputElement).value).join(',');
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
    private extractFillInBlankAnswer(element: HTMLElement): string {
        // 查找input输入框
        const inputs = element.querySelectorAll('input[type="text"]');
        if (inputs.length > 0) {
            return Array.from(inputs).map(input => (input as HTMLInputElement).value).join('|||');
        }

        return '';
    }

    /**
     * 提取简答题答案
     */
    private extractShortAnswerText(element: HTMLElement): string {
        // 查找textarea
        const textarea = element.querySelector('textarea');
        if (textarea) {
            return (textarea as HTMLTextAreaElement).value;
        }

        // 查找大的input框
        const input = element.querySelector('input[type="text"]');
        if (input) {
            return (input as HTMLInputElement).value;
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
    private extractStandardAnswer(element: HTMLElement): string | undefined {
        // 查找标准答案区域
        const standardAnswerArea = element.querySelector(
            '.standard-answer, .correct-answer, .reference-answer, [class*="standard"]'
        );
        
        if (standardAnswerArea) {
            return standardAnswerArea.textContent?.trim();
        }

        return undefined;
    }

    /**
     * 提取选择题选项
     */
    private extractOptions(element: HTMLElement): string[] {
        const options: string[] = [];

        // 查找选项元素
        const optionElements = element.querySelectorAll(
            '.option, .choice, label[for], [class*="option"]'
        );

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
