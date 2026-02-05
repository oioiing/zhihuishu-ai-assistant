# GitHub 仓库设置和推送指南 / GitHub Repository Setup and Push Guide

本指南提供了创建和推送到 GitHub 仓库的完整步骤，包括故障排除方法。

This guide provides complete steps for creating and pushing to a GitHub repository, including troubleshooting methods.

## 目录 / Table of Contents

1. [项目信息 / Project Information](#项目信息--project-information)
2. [GitHub CLI 认证 / GitHub CLI Authentication](#github-cli-认证--github-cli-authentication)
3. [创建远程仓库 / Create Remote Repository](#创建远程仓库--create-remote-repository)
4. [配置远程仓库 / Configure Remote Repository](#配置远程仓库--configure-remote-repository)
5. [推送代码 / Push Code](#推送代码--push-code)
6. [网络故障排除 / Network Troubleshooting](#网络故障排除--network-troubleshooting)
7. [常见问题 / Common Issues](#常见问题--common-issues)

---

## 项目信息 / Project Information

- **本地项目路径 / Local Project Path**: `D:\project\teacher help\zhihuishu-ai-assistant`
- **GitHub 仓库 / GitHub Repository**: `oioiing/zhihuishu-ai-assistant`
- **仓库类型 / Repository Type**: 公开仓库 / Public
- **默认分支 / Default Branch**: `main`

---

## GitHub CLI 认证 / GitHub CLI Authentication

### 方法 1: 键盘导航（用于交互式菜单）/ Method 1: Keyboard Navigation (for Interactive Menu)

如果 `gh auth login` 命令显示交互式菜单但鼠标无法点击：

If `gh auth login` shows an interactive menu but mouse clicks don't work:

```bash
gh auth login
```

**键盘操作步骤 / Keyboard Steps:**

1. **选择 GitHub.com**:
   - 按 `↓` (下箭头) 或 `↑` (上箭头) 键来导航选项
   - 按 `Enter` 键确认选择 "GitHub.com"

2. **选择协议 / Choose Protocol**:
   - 使用箭头键选择 "HTTPS" 或 "SSH"
   - 推荐选择 "HTTPS"（更简单）
   - 按 `Enter` 确认

3. **身份验证首选项 / Authentication Preference**:
   - 选择 "Login with a web browser"（推荐）
   - 或选择 "Paste an authentication token"
   - 按 `Enter` 确认

4. **完成认证 / Complete Authentication**:
   - 如果选择浏览器：复制显示的代码，按 `Enter` 打开浏览器，粘贴代码
   - 如果选择 token：从 https://github.com/settings/tokens 创建 token，粘贴

### 方法 2: 非交互式认证（推荐）/ Method 2: Non-Interactive Authentication (Recommended)

#### 选项 A: 使用 Personal Access Token (PAT)

```bash
# 1. 在 GitHub 上创建 Personal Access Token
# 访问: https://github.com/settings/tokens/new
# 
# 需要的权限 / Required scopes:
# - repo (完整仓库控制)
# - workflow (如果需要 GitHub Actions)
# 
# 复制生成的 token

# 2. 使用 token 进行身份验证
echo "YOUR_GITHUB_TOKEN" | gh auth login --with-token

# 或者使用环境变量
$env:GITHUB_TOKEN="YOUR_GITHUB_TOKEN"  # PowerShell
# 或
export GITHUB_TOKEN="YOUR_GITHUB_TOKEN"  # Git Bash / Linux
```

#### 选项 B: 使用 Web Flow（单行命令）

```bash
# 这会自动打开浏览器
gh auth login --web
```

#### 选项 C: 直接使用 Git Credentials

如果不想使用 `gh` CLI，可以直接使用 Git 凭据：

```bash
# Git 会在推送时提示输入用户名和密码（使用 Personal Access Token 作为密码）
git push origin main
# Username: your-github-username
# Password: your-github-personal-access-token
```

### 验证认证状态 / Verify Authentication

```bash
# 检查认证状态
gh auth status

# 列出已认证的账户
gh auth list
```

---

## 创建远程仓库 / Create Remote Repository

### 方法 1: 使用 GitHub CLI（需要已认证）/ Method 1: Using GitHub CLI (Requires Authentication)

```bash
# 进入项目目录
cd "D:\project\teacher help\zhihuishu-ai-assistant"

# 创建公开仓库
gh repo create oioiing/zhihuishu-ai-assistant --public --source=. --remote=origin

# 或者只创建仓库，不设置 remote
gh repo create oioiing/zhihuishu-ai-assistant --public
```

### 方法 2: 使用 GitHub Web 界面 / Method 2: Using GitHub Web Interface

如果网络问题或 CLI 不可用：

If you have network issues or CLI is unavailable:

1. **访问 GitHub / Visit GitHub**: https://github.com/new

2. **填写仓库信息 / Fill Repository Information**:
   - Repository name: `zhihuishu-ai-assistant`
   - Description: `在智慧树平台帮老师自动批阅`
   - Visibility: ✅ Public
   - **不要** 勾选 "Add a README file"（本地已有）
   - **不要** 勾选 "Add .gitignore"（本地已有）

3. **点击 "Create repository"**

4. **记录仓库 URL / Note Repository URL**:
   - HTTPS: `https://github.com/oioiing/zhihuishu-ai-assistant.git`
   - SSH: `git@github.com:oioiing/zhihuishu-ai-assistant.git`

---

## 配置远程仓库 / Configure Remote Repository

### 初始化 Git 仓库（如果尚未初始化）/ Initialize Git Repository (If Not Already Done)

```bash
# 进入项目目录
cd "D:\project\teacher help\zhihuishu-ai-assistant"

# 初始化 Git 仓库
git init

# 确认默认分支是 main（如果不是，重命名）
git branch -M main
```

### 检查现有远程配置 / Check Existing Remote Configuration

```bash
# 列出远程仓库
git remote -v
```

### 场景 1: 没有远程仓库配置 / Scenario 1: No Remote Configured

```bash
# 添加远程仓库（HTTPS）
git remote add origin https://github.com/oioiing/zhihuishu-ai-assistant.git

# 或使用 SSH
git remote add origin git@github.com:oioiing/zhihuishu-ai-assistant.git
```

### 场景 2: 远程仓库 URL 错误 / Scenario 2: Remote URL is Incorrect

```bash
# 更改远程仓库 URL
git remote set-url origin https://github.com/oioiing/zhihuishu-ai-assistant.git

# 或使用 SSH
git remote set-url origin git@github.com:oioiing/zhihuishu-ai-assistant.git
```

### 场景 3: 需要删除并重新添加 / Scenario 3: Need to Remove and Re-add

```bash
# 删除远程仓库
git remote remove origin

# 重新添加
git remote add origin https://github.com/oioiing/zhihuishu-ai-assistant.git
```

### 验证配置 / Verify Configuration

```bash
# 检查远程仓库配置
git remote -v

# 应该显示 / Should show:
# origin  https://github.com/oioiing/zhihuishu-ai-assistant.git (fetch)
# origin  https://github.com/oioiing/zhihuishu-ai-assistant.git (push)
```

---

## 推送代码 / Push Code

### 完整推送流程 / Complete Push Workflow

```bash
# 1. 确保在正确的目录
cd "D:\project\teacher help\zhihuishu-ai-assistant"

# 2. 检查状态
git status

# 3. 添加所有文件（包括 README.md 和 .gitignore）
git add .

# 4. 确认将被提交的文件
git status

# 5. 创建初始提交
git commit -m "Initial commit: Add project files"

# 6. 确保在 main 分支
git branch -M main

# 7. 推送到远程仓库
git push -u origin main

# 如果远程仓库已有内容，可能需要强制推送（谨慎使用）
# git push -u origin main --force
```

### 推送特定文件 / Push Specific Files

```bash
# 确保 README.md 和 .gitignore 被包含
git add README.md .gitignore

# 添加其他项目文件
git add src/ config/ # 根据实际项目结构调整

# 提交
git commit -m "Add project files"

# 推送
git push -u origin main
```

### 查看将被推送的文件 / View Files to be Pushed

```bash
# 查看将被提交的文件
git status

# 查看暂存区的文件
git diff --cached --name-only

# 查看所有跟踪的文件
git ls-files
```

---

## 网络故障排除 / Network Troubleshooting

### 1. 测试网络连接 / Test Network Connectivity

#### PowerShell (Windows):

```powershell
# 测试到 GitHub 的连接
Test-NetConnection github.com -Port 443

# 测试 SSH 连接（如果使用 SSH）
Test-NetConnection github.com -Port 22

# 使用 curl 测试
curl -v https://github.com

# 测试 DNS 解析
nslookup github.com

# 显示路由
Test-NetConnection github.com -TraceRoute
```

#### Git Bash / Linux:

```bash
# 测试 HTTPS 连接
curl -v https://github.com

# 测试 SSH 连接
ssh -T git@github.com

# 测试 DNS
nslookup github.com

# Ping 测试
ping github.com

# 路由跟踪
traceroute github.com  # Linux
tracert github.com     # Windows CMD
```

### 2. 配置代理 / Configure Proxy

如果需要通过代理访问 GitHub：

If you need to access GitHub through a proxy:

#### Git 代理配置 / Git Proxy Configuration:

```bash
# 设置 HTTP 代理
git config --global http.proxy http://proxy.example.com:8080
git config --global https.proxy http://proxy.example.com:8080

# 设置 SOCKS5 代理
git config --global http.proxy socks5://proxy.example.com:1080
git config --global https.proxy socks5://proxy.example.com:1080

# 只为 GitHub 设置代理
git config --global http.https://github.com.proxy http://proxy.example.com:8080

# 查看代理配置
git config --global --get http.proxy
git config --global --get https.proxy

# 取消代理配置
git config --global --unset http.proxy
git config --global --unset https.proxy
```

#### 环境变量代理 / Environment Variable Proxy:

```powershell
# PowerShell
$env:HTTP_PROXY="http://proxy.example.com:8080"
$env:HTTPS_PROXY="http://proxy.example.com:8080"

# 持久化设置
[Environment]::SetEnvironmentVariable("HTTP_PROXY", "http://proxy.example.com:8080", "User")
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://proxy.example.com:8080", "User")
```

```bash
# Git Bash / Linux
export HTTP_PROXY="http://proxy.example.com:8080"
export HTTPS_PROXY="http://proxy.example.com:8080"

# 添加到 ~/.bashrc 或 ~/.bash_profile 以持久化
```

### 3. DNS 问题修复 / DNS Issues Fix

```powershell
# 刷新 DNS 缓存 (Windows)
ipconfig /flushdns

# 尝试使用其他 DNS 服务器
# 在网络适配器设置中更改 DNS 到:
# - 8.8.8.8 (Google DNS)
# - 1.1.1.1 (Cloudflare DNS)
```

### 4. 增加 Git 超时时间 / Increase Git Timeout

```bash
# 增加 HTTP 超时时间（秒）
git config --global http.timeout 300

# 增加 HTTP 缓冲区大小（对于大仓库）
git config --global http.postBuffer 524288000
```

### 5. 使用 SSH 替代 HTTPS / Use SSH Instead of HTTPS

如果 HTTPS 连接不稳定：

If HTTPS connection is unstable:

```bash
# 生成 SSH 密钥（如果没有）
ssh-keygen -t ed25519 -C "your-email@example.com"

# 添加 SSH 公钥到 GitHub
# 复制公钥内容
cat ~/.ssh/id_ed25519.pub

# 访问 https://github.com/settings/keys 添加 SSH 密钥

# 测试 SSH 连接
ssh -T git@github.com

# 更改远程 URL 为 SSH
git remote set-url origin git@github.com:oioiing/zhihuishu-ai-assistant.git

# 推送
git push -u origin main
```

### 6. 使用 GitHub 镜像（中国用户）/ Use GitHub Mirror (China Users)

```bash
# 某些地区可以使用镜像站点（仅限克隆，不能推送）
# 推送仍需要直接访问 github.com

# 如果推送失败，考虑:
# 1. 使用 VPN
# 2. 使用代理
# 3. 联系网络管理员
```

---

## 常见问题 / Common Issues

### 问题 1: "点不动" gh auth login 的选项 / Issue 1: Cannot Click Options in gh auth login

**解决方案 / Solution:**

- 使用键盘箭头键（↑↓）和 Enter 键导航
- 或使用非交互式方法：`gh auth login --with-token` 或 `gh auth login --web`

### 问题 2: fatal: 'origin' does not appear to be a git repository

**解决方案 / Solution:**

```bash
# 检查远程配置
git remote -v

# 添加或更新远程仓库
git remote add origin https://github.com/oioiing/zhihuishu-ai-assistant.git
# 或
git remote set-url origin https://github.com/oioiing/zhihuishu-ai-assistant.git
```

### 问题 3: Failed to push some refs

**解决方案 / Solution:**

```bash
# 如果远程仓库有内容（如通过 Web 创建了 README）
git pull origin main --allow-unrelated-histories

# 解决冲突（如果有）
# 然后重新提交和推送
git add .
git commit -m "Merge remote changes"
git push -u origin main

# 或者强制推送（会覆盖远程内容，谨慎使用）
git push -u origin main --force
```

### 问题 4: Connection timeout / Network errors

**解决方案 / Solution:**

1. 检查网络连接（参见网络故障排除部分）
2. 配置代理（如果需要）
3. 尝试使用 SSH 替代 HTTPS
4. 增加超时时间：`git config --global http.timeout 300`
5. 检查防火墙设置

### 问题 5: Repository not found (404)

**解决方案 / Solution:**

- 确认仓库已在 GitHub 上创建
- 检查仓库名称拼写是否正确
- 确认用户名/组织名是否正确
- 如果是私有仓库，确保有访问权限

### 问题 6: Authentication failed

**解决方案 / Solution:**

```bash
# 重新认证
gh auth logout
gh auth login --web

# 或创建新的 Personal Access Token
# 访问: https://github.com/settings/tokens
# 确保 token 有 'repo' 权限

# 使用 Git Credential Manager
git credential-manager configure
git config --global credential.helper manager
```

### 问题 7: 文件没有被包含在推送中 / Files Not Included in Push

**检查步骤 / Checking Steps:**

```bash
# 1. 查看 .gitignore 内容
cat .gitignore

# 2. 确认文件没有被忽略
git check-ignore -v filename

# 3. 强制添加被忽略的文件（如果需要）
git add -f filename

# 4. 查看将被提交的文件
git status

# 5. 查看已跟踪的所有文件
git ls-files
```

---

## 完整工作流程总结 / Complete Workflow Summary

### 一次性完整命令（从头开始）/ Complete Commands from Scratch

```bash
# 1. 进入项目目录
cd "D:\project\teacher help\zhihuishu-ai-assistant"

# 2. 初始化 Git（如果尚未初始化）
git init

# 3. 认证 GitHub CLI
gh auth login --web
# 或使用 token:
# echo "YOUR_TOKEN" | gh auth login --with-token

# 4. 创建远程仓库
gh repo create oioiing/zhihuishu-ai-assistant --public --source=. --remote=origin
# 或手动在 Web 创建，然后:
# git remote add origin https://github.com/oioiing/zhihuishu-ai-assistant.git

# 5. 确认分支名称
git branch -M main

# 6. 添加所有文件
git add .

# 7. 查看将被提交的文件
git status

# 8. 创建初始提交
git commit -m "Initial commit: Add project files including README.md and .gitignore"

# 9. 推送到远程仓库
git push -u origin main
```

### 如果仓库已存在（只需推送）/ If Repository Already Exists (Just Push)

```bash
# 1. 进入项目目录
cd "D:\project\teacher help\zhihuishu-ai-assistant"

# 2. 检查或添加远程仓库
git remote -v
# 如果没有 origin:
git remote add origin https://github.com/oioiing/zhihuishu-ai-assistant.git

# 3. 确认文件已添加
git add .
git status

# 4. 提交
git commit -m "Update project files"

# 5. 推送
git push -u origin main
```

---

## 验证成功 / Verify Success

推送成功后，验证：

After successful push, verify:

1. **访问仓库 / Visit Repository**: https://github.com/oioiing/zhihuishu-ai-assistant

2. **检查文件 / Check Files**:
   - ✅ README.md 存在
   - ✅ .gitignore 存在
   - ✅ 所有项目文件都已上传

3. **检查本地 / Check Locally**:
   ```bash
   # 查看提交历史
   git log --oneline
   
   # 查看远程分支
   git branch -r
   
   # 查看远程仓库信息
   git remote show origin
   ```

---

## 其他资源 / Additional Resources

- **GitHub CLI 文档**: https://cli.github.com/manual/
- **Git 文档**: https://git-scm.com/doc
- **GitHub Personal Access Tokens**: https://github.com/settings/tokens
- **GitHub SSH Keys**: https://github.com/settings/keys
- **Git 配置文档**: https://git-scm.com/docs/git-config

---

## 支持 / Support

如果遇到其他问题，请：

If you encounter other issues:

1. 检查 GitHub Status: https://www.githubstatus.com/
2. 查看 Git 和 GitHub CLI 版本是否为最新
3. 查看详细错误信息并搜索解决方案
4. 在项目中创建 Issue 描述问题

---

**最后更新 / Last Updated**: 2026-02-05
