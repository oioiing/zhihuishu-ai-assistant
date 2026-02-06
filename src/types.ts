/**
 * 智慧树作业自动批改系统 - 类型定义
 * Type definitions for homework auto-grading system
 */

/**
 * 题型枚举
 * Question type enum
 */
export enum QuestionType {
    MULTIPLE_CHOICE = 'multiple_choice',  // 选择题
    FILL_IN_BLANK = 'fill_in_blank',      // 填空题
    SHORT_ANSWER = 'short_answer',         // 简答题
    UNKNOWN = 'unknown'                    // 未知类型
}

/**
 * 问题数据结构
 * Question data structure
 */
export interface Question {
    id: string;                            // 题目ID
    type: QuestionType;                    // 题目类型
    element: HTMLElement;                  // DOM元素
    content: string;                       // 题目内容
    studentAnswer: string;                 // 学生答案
    standardAnswer?: string;               // 标准答案
    score?: number;                        // 得分
    maxScore?: number;                     // 满分
    options?: string[];                    // 选项（选择题）
}

/**
 * 批改规则配置
 * Grading rule configuration
 */
export interface GradingRules {
    // 选择题规则
    multipleChoice: {
        caseSensitive: boolean;            // 是否区分大小写
        trimWhitespace: boolean;           // 是否去除空格
    };
    
    // 填空题规则
    fillInBlank: {
        fuzzyMatch: boolean;               // 是否模糊匹配
        ignoreCase: boolean;               // 是否忽略大小写
        trimWhitespace: boolean;           // 是否去除空格
        synonyms: Record<string, string[]>; // 同义词映射
        similarityThreshold: number;       // 相似度阈值 (0-1)
    };
    
    // 简答题规则
    shortAnswer: {
        keywordMatching: boolean;          // 是否启用关键词匹配
        keywords: string[];                // 关键词列表
        minWordCount: number;              // 最少字数
        maxWordCount: number;              // 最多字数
        useAI: boolean;                    // 是否使用AI评分
    };
}

/**
 * 批改结果
 * Grading result
 */
export interface GradingResult {
    questionId: string;                    // 题目ID
    type: QuestionType;                    // 题目类型
    score: number;                         // 得分
    maxScore: number;                      // 满分
    passed: boolean;                       // 是否通过
    feedback: string;                      // 反馈信息
    suggestions: string[];                 // 改进建议
    details?: {                            // 详细信息
        correctAnswer?: string;            // 正确答案
        similarity?: number;               // 相似度
        keywordsFound?: string[];          // 找到的关键词
        wordCount?: number;                // 字数
    };
}

/**
 * AI服务接口
 * AI service interface
 */
export interface AIServiceInterface {
    // 分析简答题
    analyzeShortAnswer(
        question: string,
        studentAnswer: string,
        standardAnswer?: string
    ): Promise<AIAnalysisResult>;
    
    // 批量分析
    batchAnalyze(questions: Question[]): Promise<AIAnalysisResult[]>;
}

/**
 * AI分析结果
 * AI analysis result
 */
export interface AIAnalysisResult {
    score: number;                         // AI评分
    maxScore: number;                      // 满分
    feedback: string;                      // 反馈
    suggestions: string[];                 // 建议
    confidence: number;                    // 置信度 (0-1)
}

/**
 * 日志级别
 * Log level
 */
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

/**
 * 日志配置
 * Logger configuration
 */
export interface LoggerConfig {
    enabled: boolean;                      // 是否启用日志
    level: LogLevel;                       // 日志级别
    prefix: string;                        // 日志前缀
    showTimestamp: boolean;                // 是否显示时间戳
}

/**
 * 批改会话
 * Grading session
 */
export interface GradingSession {
    sessionId: string;                     // 会话ID
    pageUrl: string;                       // 页面URL
    startTime: number;                     // 开始时间
    questions: Question[];                 // 题目列表
    results: GradingResult[];              // 批改结果
    totalScore: number;                    // 总分
    maxTotalScore: number;                 // 总满分
}

/**
 * 页面适配器接口
 * Page adapter interface
 */
export interface PageAdapter {
    // 检测页面是否匹配
    matches(): boolean;
    
    // 提取所有题目
    extractQuestions(): Question[];
    
    // 注入反馈UI
    injectFeedbackUI(result: GradingResult, question: Question): void;
    
    // 注入批量操作UI
    injectBatchUI(onBatchGrade: () => void): void;
}
