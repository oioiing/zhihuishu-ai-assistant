// 智慧树 AI 助教 - 配置模板
// 
// 使用说明：
// 1. 复制此文件并重命名为 config.local.js
// 2. 在 config.local.js 中填入您的真实 API 密钥
// 3. config.local.js 已在 .gitignore 中，不会被提交到代码仓库
//
// 注意：请勿直接修改此模板文件，也不要将真实密钥提交到 Git

const CONFIG = {
    // DeepSeek API 配置
    // 获取地址: https://platform.deepseek.com
    DEEPSEEK_API_KEY: "YOUR_DEEPSEEK_API_KEY_HERE",
    
    // OCR.space API 配置
    // 获取地址: https://ocr.space/ocrapi
    OCR_API_KEY: "YOUR_OCR_API_KEY_HERE",
    
    // 调试模式 (开启后会在控制台显示详细日志)
    DEBUG_MODE: false
};

// 如果使用此配置文件，请在 background.js 中导入
// 但由于浏览器扩展的限制，建议使用 chrome.storage 管理配置
