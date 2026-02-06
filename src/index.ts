/**
 * 智慧树作业自动批改系统
 * Zhihuishu Homework Auto-Grading System
 * 
 * 主入口文件 - 导出所有模块和公共接口
 */

// 核心模块
export { HomeworkGrader, homeworkGrader } from './homeworkGrader';
export { ContentExtractor } from './contentExtractor';
export { QuestionDetector } from './questionDetector';
export { GradingEngine } from './gradingEngine';
export { FeedbackRenderer } from './feedbackRenderer';
export { 
    DeepSeekAIService, 
    RuleEngineService, 
    AIServiceFactory 
} from './aiService';
export { Logger, logger } from './logger';

// 类型定义
export {
    QuestionType,
    Question,
    GradingRules,
    GradingResult,
    AIServiceInterface,
    AIAnalysisResult,
    LogLevel,
    LoggerConfig,
    GradingSession,
    PageAdapter
} from './types';

/**
 * 版本信息
 */
export const VERSION = '2.0.0';

/**
 * 系统信息
 */
export const SYSTEM_INFO = {
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
export function initialize(): void {
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
export async function quickStart(): Promise<void> {
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
        } catch (error) {
            log.error('初始化失败:', error);
        }
    } else {
        log.debug('当前不是作业页面');
    }
}
