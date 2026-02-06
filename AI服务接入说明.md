# AI服务接入说明

## 概述

智慧树作业自动批改系统支持两种评分模式：
1. **规则引擎模式**：基于预设规则的本地评分，快速且无需网络
2. **AI服务模式**：使用DeepSeek AI进行智能评分，更精准但需要API密钥

## 架构设计

系统采用可插拔的AI服务架构，支持灵活切换和扩展：

```
┌─────────────────┐
│  批改引擎       │
│ GradingEngine  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼──────┐
│规则引擎│ │AI服务   │
│ Rule  │ │AI Service│
└───────┘ └─────────┘
             │
      ┌──────┴──────┐
      │             │
  ┌───▼────┐   ┌───▼────┐
  │DeepSeek│   │其他AI  │
  │Service │   │(扩展)  │
  └────────┘   └────────┘
```

## DeepSeek AI 服务

### 1. 获取API密钥

#### 步骤1: 注册账户

访问 [DeepSeek 开放平台](https://platform.deepseek.com)

1. 点击"注册"按钮
2. 填写邮箱和密码
3. 完成邮箱验证

#### 步骤2: 创建API密钥

1. 登录后进入控制台
2. 点击"API Keys"
3. 点击"创建新密钥"
4. 复制生成的密钥（格式：`sk-xxxxxxxxxx...`）

⚠️ **重要提示**：
- API密钥仅显示一次，请妥善保存
- 不要将密钥提交到公共代码仓库
- 定期检查使用情况和余额

#### 步骤3: 充值账户

1. 进入"账户充值"页面
2. 选择充值金额
3. 完成支付

💡 **定价参考**（以实际为准）：
- GPT-3.5级别模型：约 ¥0.002/千token
- 100元可使用约5000万token

### 2. 配置API密钥

#### 方法1: 通过代码配置（开发者）

```javascript
// 导入AI服务工厂
import { AIServiceFactory } from './aiService';

// 设置API密钥
const apiKey = 'sk-xxxxxxxxxx...'; // 替换为你的密钥
const aiService = AIServiceFactory.getDeepSeekService(apiKey);

// 检查服务是否可用
const isAvailable = await aiService.checkAvailability();
if (isAvailable) {
    console.log('✅ AI服务已就绪');
} else {
    console.log('❌ AI服务不可用');
}
```

#### 方法2: 通过批改系统配置（推荐）

```javascript
// 导入作业批改器
import { homeworkGrader } from './homeworkGrader';

// 启用AI批改
const success = await homeworkGrader.enableAIGrading('sk-xxxxxxxxxx...');

if (success) {
    console.log('✅ AI批改已启用');
} else {
    console.log('❌ AI服务启用失败');
}
```

#### 方法3: 通过背景脚本配置

在 `background.js` 中修改：

```javascript
// 在文件顶部添加
const DEEPSEEK_API_KEY = 'sk-xxxxxxxxxx...'; // 替换为你的密钥

// 在API调用函数中使用
async function callDeepSeekAPI(message) {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        // ...
    });
}
```

### 3. API使用示例

#### 基本调用

```javascript
import { DeepSeekAIService } from './aiService';

const aiService = new DeepSeekAIService('sk-xxxxxxxxxx...');

// 分析简答题
const result = await aiService.analyzeShortAnswer(
    '请简述中国四大发明的意义',  // 题目
    '四大发明包括造纸术、印刷术、火药和指南针，它们对世界文明产生了深远影响。', // 学生答案
    '四大发明是古代中国的重要发明创造...' // 标准答案（可选）
);

console.log(result);
// {
//     score: 8,
//     maxScore: 10,
//     feedback: '回答较为全面，涵盖了主要内容',
//     suggestions: ['可以补充具体的历史影响', '建议举例说明'],
//     confidence: 0.85
// }
```

#### 批量调用

```javascript
// 批量分析多个题目
const questions = [
    { id: '1', content: '题目1...', studentAnswer: '答案1...', standardAnswer: '标准1...' },
    { id: '2', content: '题目2...', studentAnswer: '答案2...', standardAnswer: '标准2...' },
];

const results = await aiService.batchAnalyze(questions);

results.forEach((result, index) => {
    console.log(`题目 ${index + 1}:`, result);
});
```

### 4. 降级策略

系统会自动在AI服务不可用时降级到规则引擎：

```javascript
// AI服务工厂会自动处理降级
const service = await AIServiceFactory.getService(
    true,  // 尝试使用AI
    'sk-xxxxxxxxxx...'
);

// 如果AI不可用，会自动返回规则引擎服务
// 业务代码无需修改
const result = await service.analyzeShortAnswer(question, answer);
```

### 5. 错误处理

```javascript
try {
    const result = await aiService.analyzeShortAnswer(
        question, 
        studentAnswer
    );
    // 处理成功结果
} catch (error) {
    if (error.message.includes('401')) {
        console.error('❌ API密钥无效');
    } else if (error.message.includes('403')) {
        console.error('❌ 余额不足，请充值');
    } else if (error.message.includes('429')) {
        console.error('❌ 请求过于频繁，请稍后重试');
    } else {
        console.error('❌ 未知错误:', error.message);
    }
    
    // 降级到规则引擎
    const ruleService = AIServiceFactory.getRuleEngineService();
    const result = await ruleService.analyzeShortAnswer(
        question, 
        studentAnswer
    );
}
```

## 规则引擎服务

不需要API密钥，完全本地运行。

### 使用方法

```javascript
import { RuleEngineService } from './aiService';

const ruleEngine = new RuleEngineService();

const result = await ruleEngine.analyzeShortAnswer(
    question, 
    studentAnswer, 
    standardAnswer
);

// 规则引擎评分基于：
// 1. 字数统计
// 2. 关键词匹配
// 3. 答案完整性
```

### 优缺点对比

| 特性 | 规则引擎 | AI服务 |
|------|---------|--------|
| **准确度** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **速度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **成本** | 免费 | 付费 |
| **网络** | 不需要 | 需要 |
| **适用题型** | 客观题 | 所有题型 |
| **个性化** | 有限 | 高度个性化 |

## 扩展其他AI服务

系统支持接入其他AI服务。

### 实现AI服务接口

```typescript
import { AIServiceInterface, AIAnalysisResult } from './types';

export class CustomAIService implements AIServiceInterface {
    private apiKey: string;
    private apiUrl: string;
    
    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.apiUrl = 'https://your-ai-service.com/api';
    }
    
    async analyzeShortAnswer(
        question: string,
        studentAnswer: string,
        standardAnswer?: string
    ): Promise<AIAnalysisResult> {
        // 调用你的AI服务API
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question,
                studentAnswer,
                standardAnswer
            })
        });
        
        const data = await response.json();
        
        // 转换为标准格式
        return {
            score: data.score,
            maxScore: 10,
            feedback: data.feedback,
            suggestions: data.suggestions || [],
            confidence: data.confidence || 0.8
        };
    }
    
    async batchAnalyze(questions: Question[]): Promise<AIAnalysisResult[]> {
        // 实现批量分析
        const results = [];
        for (const q of questions) {
            const result = await this.analyzeShortAnswer(
                q.content,
                q.studentAnswer,
                q.standardAnswer
            );
            results.push(result);
        }
        return results;
    }
}
```

### 注册到服务工厂

```javascript
// 在 aiService.ts 中添加
export class AIServiceFactory {
    // ... 现有代码 ...
    
    static getCustomService(apiKey: string): CustomAIService {
        return new CustomAIService(apiKey);
    }
}
```

## 性能优化

### 1. 批量处理

批量处理可以减少API调用次数：

```javascript
// 不推荐：逐个调用
for (const question of questions) {
    const result = await aiService.analyzeShortAnswer(...);
}

// 推荐：批量调用
const results = await aiService.batchAnalyze(questions);
```

### 2. 缓存结果

对相同问题缓存结果：

```javascript
const cache = new Map();

async function getCachedAnalysis(question, answer) {
    const cacheKey = `${question}:${answer}`;
    
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    
    const result = await aiService.analyzeShortAnswer(question, answer);
    cache.set(cacheKey, result);
    
    return result;
}
```

### 3. 限流控制

防止请求过于频繁：

```javascript
class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }
    
    async acquire() {
        const now = Date.now();
        this.requests = this.requests.filter(
            time => now - time < this.timeWindow
        );
        
        if (this.requests.length >= this.maxRequests) {
            const waitTime = this.timeWindow - (now - this.requests[0]);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.acquire();
        }
        
        this.requests.push(now);
    }
}

// 使用限流器
const limiter = new RateLimiter(10, 1000); // 每秒最多10个请求

async function rateLimitedAnalysis(question, answer) {
    await limiter.acquire();
    return aiService.analyzeShortAnswer(question, answer);
}
```

## 安全建议

### 1. 保护API密钥

❌ **不要这样做**：
```javascript
// 不要将密钥硬编码在前端代码中
const API_KEY = 'sk-xxxxxxxxxx...';
```

✅ **应该这样做**：
```javascript
// 使用环境变量或配置文件
const API_KEY = process.env.DEEPSEEK_API_KEY;

// 或通过后端代理
async function callAI(data) {
    return fetch('/api/analyze', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}
```

### 2. 输入验证

```javascript
function validateInput(question, answer) {
    if (!question || question.length > 1000) {
        throw new Error('题目长度不合法');
    }
    
    if (!answer || answer.length > 5000) {
        throw new Error('答案长度不合法');
    }
    
    // 过滤敏感内容
    const sensitiveWords = ['敏感词1', '敏感词2'];
    for (const word of sensitiveWords) {
        if (answer.includes(word)) {
            throw new Error('答案包含不当内容');
        }
    }
}
```

### 3. 监控和日志

```javascript
import { logger } from './logger';

async function monitoredAICall(question, answer) {
    const startTime = Date.now();
    
    try {
        logger.info('开始AI分析', { question: question.substring(0, 50) });
        
        const result = await aiService.analyzeShortAnswer(question, answer);
        
        const duration = Date.now() - startTime;
        logger.info('AI分析完成', { duration, score: result.score });
        
        return result;
    } catch (error) {
        logger.error('AI分析失败', error);
        throw error;
    }
}
```

## 常见问题

### Q: API密钥在哪里配置？
A: 有三种方式：代码配置、UI配置、环境变量。推荐使用UI配置或环境变量。

### Q: AI评分比规则引擎慢多少？
A: 通常慢2-5倍，但准确度显著提升。可以针对简答题使用AI，其他题型使用规则引擎。

### Q: 如何控制API成本？
A: 
1. 仅对需要的题目启用AI
2. 使用批量API减少请求次数
3. 缓存结果避免重复分析
4. 设置合理的 `maxWordCount` 限制

### Q: API调用失败怎么办？
A: 系统会自动降级到规则引擎，确保批改功能不中断。

### Q: 支持其他AI模型吗？
A: 支持。实现 `AIServiceInterface` 接口即可接入任何AI服务。

## 技术支持

如有问题，请：
1. 查看[故障排除指南](./README.md#故障排除)
2. 查看系统日志（按F12打开控制台）
3. 提交Issue到GitHub仓库

---

**版本**: 2.0.0  
**最后更新**: 2024-02-06  
**相关文档**: [自定义批改规则指南](./自定义批改规则指南.md)
