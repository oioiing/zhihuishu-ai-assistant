# 知慧树智能作业阅卷助手 v2

这是一个用于知慧树教学平台的 Chrome 扩展，提供单题智能批改、班级自动批改、作业详情 AI 分析与重新批阅等功能，帮助教师高效完成批改工作。

## 快速安装（3 分钟）

1. 下载或克隆本仓库到本地。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 开启右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择本项目根目录。
5. 安装完成后，按 [USER_GUIDE.md](docs/USER_GUIDE.md) 开始使用。

## 项目截图

- 截图目录： [assets/screenshots](assets/screenshots)
- 截图说明： [assets/screenshots/README.md](assets/screenshots/README.md)
- 建议放置 3 张图：弹窗首页、自动批改流程、作业分析结果

## 推荐阅读顺序（1 分钟上手）

1. 先看 [README_教师使用简版.md](docs/README_教师使用简版.md)：快速了解能做什么。
2. 再看 [USER_GUIDE.md](docs/USER_GUIDE.md)：按页面入口完成首次使用。
3. 需要细调时看 [功能说明.md](docs/功能说明.md)：查看配置、消息动作与边界。
4. 遇到问题看 [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)：按症状排查。

## 功能一览

- 单题智能批改：在作业题目页一键生成评分与评语
- 自动批改整个班级：自动进入学生作答页、填写分数和评语并保存
- 作业详情 AI 分析：自动生成作业类型、评分标准、批改建议与常见错误
- 重新批阅模式：允许将已批阅作业纳入自动批改
- 分层评语与AI使用引导：支持疑似AI句标记、人工改写建议、情感支持与进阶建议
- 班级共性问题统计：自动汇总高频错误、逻辑追问、文化提示与练习建议
- 长期能力跟踪：基于历史记录展示学生进步与需关注对象，并生成徽章候选

## 快速开始

- 安装与使用流程见 [USER_GUIDE.md](docs/USER_GUIDE.md)
- 功能与配置说明见 [功能说明.md](docs/功能说明.md)

## 故障排查

常见问题与排查步骤见 [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 兼容性

- Chrome 88+
- Edge 88+

## 数据与隐私

- 所有页面操作在本地浏览器中执行
- AI 评分会调用 DeepSeek API（需要配置 API Key）

## 文档结构

- 使用与功能说明： [USER_GUIDE.md](docs/USER_GUIDE.md)
- 教师使用简版： [README_教师使用简版.md](docs/README_教师使用简版.md)
- 完整功能与配置： [功能说明.md](docs/功能说明.md)
- 故障排查： [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 开发维护

- 变更记录： [CHANGELOG.md](CHANGELOG.md)
- Git 忽略规则： [.gitignore](.gitignore)
- 协作规范： [CONTRIBUTING.md](CONTRIBUTING.md)

## GitHub 协作模板

- Bug Issue 模板： [.github/ISSUE_TEMPLATE/bug_report.md](.github/ISSUE_TEMPLATE/bug_report.md)
- 功能建议模板： [.github/ISSUE_TEMPLATE/feature_request.md](.github/ISSUE_TEMPLATE/feature_request.md)
- PR 模板： [.github/pull_request_template.md](.github/pull_request_template.md)
