/**
 * Simple bundler to combine TypeScript output files for Chrome extension
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const outputFile = path.join(__dirname, 'homework-grading-bundle.js');

// 读取所有编译后的 JS 文件（按依赖顺序）
const files = [
    'types.js',
    'logger.js',
    'questionDetector.js',
    'contentExtractor.js',
    'gradingEngine.js',
    'aiService.js',
    'feedbackRenderer.js',
    'homeworkGrader.js',
    'index.js'
];

console.log('📦 开始打包作业批改系统...');

let bundle = `
/**
 * 智慧树作业自动批改系统 - 打包版本
 * Bundled by build script
 */

(function() {
    'use strict';
    
    // 创建模块命名空间
    const ZhiHuiShuGrading = {};
    
`;

// 读取并合并所有文件
files.forEach(file => {
    const filePath = path.join(distDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✓ 添加 ${file}`);
        const content = fs.readFileSync(filePath, 'utf8');
        // 移除 export 语句，改为赋值到命名空间
        const modified = content
            .replace(/export\s+\{[^}]+\};?/g, '') // 移除 export { ... }
            .replace(/export\s+(const|let|var|function|class)\s+/g, 'ZhiHuiShuGrading.'); // 替换 export
        bundle += `\n// ===== ${file} =====\n${modified}\n`;
    } else {
        console.warn(`  ⚠ 文件不存在: ${file}`);
    }
});

bundle += `
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
`;

fs.writeFileSync(outputFile, bundle);
console.log(`✅ 打包完成: ${outputFile}`);
console.log(`📦 文件大小: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);
