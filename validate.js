#!/usr/bin/env node
/**
 * 验证智慧树 AI 助教浏览器扩展结构
 * 检查关键文件、配置和代码质量
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始验证智慧树 AI 助教扩展...\n');

let hasErrors = false;
let warnings = 0;

// 检查必需的文件
const requiredFiles = [
    'manifest.json',
    'background.js',
    'content.js',
    'popup.html',
    'README.md',
    '.gitignore',
    'config.example.js'
];

console.log('📁 检查必需文件...');
requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ 缺失: ${file}`);
        hasErrors = true;
    }
});
console.log();

// 验证 manifest.json
console.log('📋 验证 manifest.json...');
try {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    
    // 检查版本
    if (manifest.manifest_version === 3) {
        console.log('  ✅ Manifest V3');
    } else {
        console.log('  ⚠️  使用的不是 Manifest V3');
        warnings++;
    }
    
    // 检查必需字段
    const requiredFields = ['name', 'version', 'description'];
    requiredFields.forEach(field => {
        if (manifest[field]) {
            console.log(`  ✅ ${field}: ${manifest[field]}`);
        } else {
            console.log(`  ❌ 缺失字段: ${field}`);
            hasErrors = true;
        }
    });
    
    // 检查 content_scripts
    if (manifest.content_scripts && manifest.content_scripts.length > 0) {
        console.log(`  ✅ Content Scripts: ${manifest.content_scripts.length} 个`);
        manifest.content_scripts.forEach((script, i) => {
            console.log(`     - 匹配模式: ${script.matches.join(', ')}`);
        });
    } else {
        console.log('  ❌ 没有配置 content_scripts');
        hasErrors = true;
    }
    
    // 检查权限
    if (manifest.permissions) {
        console.log(`  ✅ 权限: ${manifest.permissions.join(', ')}`);
    }
    
    if (manifest.host_permissions) {
        console.log(`  ✅ Host 权限: ${manifest.host_permissions.length} 个`);
    }
    
} catch (error) {
    console.log(`  ❌ manifest.json 解析错误: ${error.message}`);
    hasErrors = true;
}
console.log();

// 检查 API 密钥安全性
console.log('🔒 检查安全性...');
const securityFiles = ['background.js', 'content.js'];
let foundHardcodedKeys = false;

securityFiles.forEach(file => {
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        
        // 检查是否有硬编码的 API 密钥
        const apiKeyPatterns = [
            /sk-[a-zA-Z0-9]{30,}/,  // DeepSeek 密钥格式
            /apikey.*['"]((?!helloworld)[a-zA-Z0-9]{10,})['"]/i  // 其他 API 密钥
        ];
        
        apiKeyPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches && !content.includes('YOUR_') && !content.includes('example')) {
                console.log(`  ⚠️  ${file} 可能包含硬编码的 API 密钥`);
                warnings++;
                foundHardcodedKeys = true;
            }
        });
    }
});

if (!foundHardcodedKeys) {
    console.log('  ✅ 未发现硬编码的 API 密钥');
}

// 检查是否使用 chrome.storage
const backgroundContent = fs.readFileSync('background.js', 'utf8');
if (backgroundContent.includes('chrome.storage')) {
    console.log('  ✅ 使用 chrome.storage 管理配置');
} else {
    console.log('  ⚠️  未使用 chrome.storage');
    warnings++;
}
console.log();

// 检查 .gitignore
console.log('🚫 检查 .gitignore...');
if (fs.existsSync('.gitignore')) {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    const protectedPatterns = ['config.local.js', '.env', 'node_modules'];
    
    protectedPatterns.forEach(pattern => {
        if (gitignore.includes(pattern)) {
            console.log(`  ✅ 保护: ${pattern}`);
        } else {
            console.log(`  ⚠️  未保护: ${pattern}`);
            warnings++;
        }
    });
}
console.log();

// 统计代码大小
console.log('📊 代码统计...');
['background.js', 'content.js'].forEach(file => {
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n').length;
        const size = (fs.statSync(file).size / 1024).toFixed(2);
        console.log(`  ${file}: ${lines} 行, ${size} KB`);
    }
});
console.log();

// 总结
console.log('='.repeat(50));
if (hasErrors) {
    console.log('❌ 验证失败：发现错误');
    process.exit(1);
} else if (warnings > 0) {
    console.log(`⚠️  验证通过，但有 ${warnings} 个警告`);
    process.exit(0);
} else {
    console.log('✅ 验证通过：扩展结构完整');
    process.exit(0);
}
